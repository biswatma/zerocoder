const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const path = require('path'); // Added for serving static files
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Add a root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Changed route from /generate to /api/generate to match Vercel structure and updated frontend call
app.get('/api/generate', async (req, res) => {
  console.log("\n\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.log("[SERVER DEBUG] /api/generate ROUTE HANDLER STARTED (for local server)!");
  console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n\n");

  const prompt = req.query.prompt;
  const apiKey = req.query.apiKey; // Get API key from query parameter
  const engine = req.query.engine || 'gemini'; // Default to gemini

  if (!prompt) {
    console.log("[SERVER DEBUG] Prompt is missing, sending 400 error.");
    return res.status(400).json({ error: "Prompt is required" });
  }
  // API Key is only required for Gemini
  if (engine === 'gemini' && !apiKey) {
    console.log("[SERVER DEBUG] API Key is missing for Gemini, sending 400 error.");
    return res.status(400).json({ error: "API Key is required for Gemini" });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Explicitly flush headers BEFORE the try block

  const systemPromptText = "You are Zerocoder, an advanced HTML code generation engine. Your output MUST be a single, complete, and valid HTML document using Tailwind CSS (via CDN in the <head>). All designs must be responsive, visually appealing, and follow modern UI/UX best practices.\n\nFor any image content, if no suitable external image is available, generate SVG graphics directly within the HTML. The SVGs should be simple, clean, and vector-based to fit the content needs (e.g., icons, logos, or abstract patterns). These SVGs should be visually appropriate for the section of the site they appear in and should follow best design principles (e.g., minimalistic icons, geometric shapes, or abstract art for backgrounds).\n\nUse high-quality placeholder services like Lorem Picsum or Unsplash Source for images when necessary, but prioritize SVGs when appropriate. Do NOT include any explanatory text, markdown formatting, comments, or extra characters. Output ONLY raw HTML. Start exactly with <!DOCTYPE html> and end exactly with </html>. No text or characters are allowed before or after the HTML document—just clean, production-ready HTML.";

  if (engine === 'lmstudio') {
    const lmstudioNoThink = req.query.lmstudio_no_think === 'true';
    let finalPrompt = prompt;
    if (lmstudioNoThink) {
      finalPrompt = `${prompt} /no_think`;
      console.log(`[Server] LM Studio 'no_think' is enabled. Modified prompt: "${finalPrompt}"`);
    } else {
      console.log(`[Server] LM Studio 'no_think' is disabled. Original prompt: "${finalPrompt}"`);
    }
    console.log(`[Server] Attempting to stream from LM Studio for prompt: "${prompt}" (final to be sent: "${finalPrompt}")`);
    const controller = new AbortController(); // Create an AbortController

    res.on('close', () => {
      console.log('[Server] Client closed connection. Aborting LM Studio request.');
      controller.abort(); // Abort the axios request if client disconnects
    });

    try {
      const lmStudioUrl = process.env.LMSTUDIO_URL || 'http://localhost:1234/v1/chat/completions';
      const lmStudioPayload = {
        model: process.env.LMSTUDIO_MODEL || undefined, // Optional: specify model if not pre-loaded
        messages: [
          { role: "system", content: systemPromptText },
          { role: "user", content: finalPrompt }
        ],
        stream: true
      };

      const lmStudioResponse = await axios.post(lmStudioUrl, lmStudioPayload, {
        responseType: 'stream',
        signal: controller.signal // Pass the abort signal to axios
      });

      let buffer = '';
      lmStudioResponse.data.on('data', (chunk) => {
        buffer += chunk.toString();
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const dataLine = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);
          if (dataLine.startsWith('data: ')) {
            const jsonData = dataLine.substring(6);
            if (jsonData.trim() === '[DONE]') {
              console.log("[Server] LM Studio stream [DONE] received.");
              // EOS is sent after this loop or in 'end' event
              continue; 
            }
            try {
              const parsed = JSON.parse(jsonData);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                const textChunk = parsed.choices[0].delta.content;
                console.log("[Server] Sending LM Studio text chunk to client:", textChunk.substring(0,100) + "...");
                res.write(`data: ${JSON.stringify({ htmlChunk: textChunk })}\n\n`);
              }
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].finish_reason === 'stop') {
                console.log("[Server] LM Studio stream finished (finish_reason: stop).");
                // EOS will be sent by 'end' event handler
              }
            } catch (e) {
              console.warn('[Server] Error parsing LM Studio JSON chunk:', jsonData, e.message);
            }
          }
        }
      });

      lmStudioResponse.data.on('end', () => {
        console.log("[Server] LM Studio stream ended.");
        if (buffer.trim().length > 0) { // Process any remaining data in buffer
            if (buffer.startsWith('data: ')) {
                const jsonData = buffer.substring(6);
                if (jsonData.trim() !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(jsonData);
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            const textChunk = parsed.choices[0].delta.content;
                            console.log("[Server] Sending final LM Studio text chunk to client:", textChunk.substring(0,100) + "...");
                            res.write(`data: ${JSON.stringify({ htmlChunk: textChunk })}\n\n`);
                        }
                    } catch (e) {
                        console.warn('[Server] Error parsing final LM Studio JSON chunk:', jsonData, e.message);
                    }
                }
            }
        }
        res.write('data: {"event": "EOS"}\n\n');
        res.end();
        console.log("[Server] Finished processing LM Studio stream and sent EOS to client.");
      });

      lmStudioResponse.data.on('error', (streamError) => {
        console.error('[Server] Error event during LM Studio stream pipe:', streamError);
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ error: streamError.message || 'LM Studio stream pipe error event' })}\n\n`);
            res.write('data: {"event": "EOS"}\n\n');
            res.end();
          } catch (e) {
            console.error("[Server] Error writing error to client response after LM Studio stream error:", e);
            if (!res.writableEnded) res.end();
          }
        }
      });

    } catch (err) {
      if (err.name === 'AbortError' || (axios.isCancel && axios.isCancel(err))) {
        console.log('[Server] LM Studio request aborted by client.');
        // Ensure the response to the client is properly ended if not already.
        if (!res.writableEnded) {
          res.write('data: {"event": "EOS", "reason": "aborted"}\n\n');
          res.end();
        }
        return; // Stop further processing for this aborted request
      }

      console.error('[Server] Error setting up or during LM Studio stream request:', err.isAxiosError ? err.message : err);
      let errorMessage = 'Failed to connect to LM Studio API for streaming.';
      if (err.response && err.response.data) {
        let errorData = err.response.data;
         if (errorData instanceof require('stream').Readable) {
            let chunks = [];
            errorData.on('data', chunk => chunks.push(chunk));
            errorData.on('end', () => {
                const errorString = Buffer.concat(chunks).toString();
                console.error("[Server] LM Studio error response (streamed):", errorString);
                try {
                    const parsedError = JSON.parse(errorString);
                    errorMessage = parsedError.error ? (parsedError.error.message || errorString) : errorString;
                } catch (parseErr) {
                    errorMessage = errorString;
                }
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
                    res.write('data: {"event": "EOS"}\n\n');
                    res.end();
                }
            });
            return; // Handled by stream events
        } else {
            console.error("[Server] LM Studio error response (data):", errorData);
            if (errorData.error && errorData.error.message) {
                errorMessage = errorData.error.message;
            } else if (typeof errorData === 'string') {
                errorMessage = errorData;
            } else if (err.message) {
                errorMessage = err.message;
            }
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.write('data: {"event": "EOS"}\n\n');
        res.end();
      }
    }

  } else { // Default to Gemini
    try {
      // Using the API key passed from the client
      const geminiStreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:streamGenerateContent?key=${apiKey}`;
      
      const geminiPayload = {
        contents: [{ 
          parts: [{ text: prompt }]  // User's direct prompt
        }],
        system_instruction: {         // Official field for system instructions
          parts: [{ text: systemPromptText }]
        }
      };

      console.log(`[Server] Attempting to stream from Gemini with dedicated system_instruction field for prompt: "${prompt}"`);
      const geminiResponse = await axios.post(geminiStreamUrl, geminiPayload, {
        responseType: 'stream'
      });
      
      let jsonBuffer = ''; 

      geminiResponse.data.on('data', (chunk) => {
        jsonBuffer += chunk.toString();
        try {
          const potentialObjects = jsonBuffer.split('\n').filter(s => s.trim() !== '');
          let processedAnyThisChunk = false;
          potentialObjects.forEach(potentialJsonString => {
              try {
                  let parsableJsonString = potentialJsonString.trim();
                  if (parsableJsonString.startsWith(',')) parsableJsonString = parsableJsonString.substring(1);
                  if (parsableJsonString.endsWith(',')) parsableJsonString = parsableJsonString.slice(0, -1);

                  if (!parsableJsonString) return;

                  const responseObject = JSON.parse(parsableJsonString);
                  if (responseObject.candidates && responseObject.candidates[0] &&
                      responseObject.candidates[0].content && responseObject.candidates[0].content.parts &&
                      responseObject.candidates[0].content.parts[0] && responseObject.candidates[0].content.parts[0].text) {
                    const textChunk = responseObject.candidates[0].content.parts[0].text;
                    console.log("[Server] Sending Gemini text chunk to client:", textChunk.substring(0,100) + "...");
                    res.write(`data: ${JSON.stringify({ htmlChunk: textChunk })}\n\n`);
                    processedAnyThisChunk = true;
                  } else if (responseObject.error) {
                    console.error("[Server] Error object in Gemini response chunk:", responseObject.error);
                    res.write(`data: ${JSON.stringify({ error: responseObject.error.message || 'Error in Gemini response object' })}\n\n`);
                    processedAnyThisChunk = true;
                  }
              } catch (e) {
                  // Incomplete JSON in this part of the buffer, wait for more data
              }
          });
          if(processedAnyThisChunk) jsonBuffer = ''; 

        } catch (e) {
          console.warn('[Server] Error processing/parsing chunk from Gemini, might be partial. Chunk:', jsonBuffer.substring(0,200));
        }
      });

      geminiResponse.data.on('end', () => {
        console.log("[Server] Gemini stream ended.");
        if (jsonBuffer.trim().length > 0 && jsonBuffer.trim() !== '[' && jsonBuffer.trim() !== ']') {
            console.warn("[Server] Remaining data in buffer after Gemini stream end:", jsonBuffer);
        }
        
        res.write('data: {"event": "EOS"}\n\n');
        res.end();
        console.log("[Server] Finished processing Gemini stream and sent EOS to client.");
      });

      geminiResponse.data.on('error', (streamError) => { 
        console.error('[Server] Error event during Gemini stream pipe:', streamError);
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ error: streamError.message || 'Gemini stream pipe error event' })}\n\n`);
            res.write('data: {"event": "EOS"}\n\n');
            res.end();
          } catch (e) {
            console.error("[Server] Error writing error to client response after stream error:", e);
            if (!res.writableEnded) res.end(); 
          }
        }
      });

    } catch (err) {
      console.error('[Server] Error setting up or during Gemini stream request:', err.isAxiosError ? err.message : err);
      let errorMessage = 'Failed to connect to Gemini API for streaming.';
      if (err.response && err.response.data) { 
          let errorData = err.response.data;
          if (errorData instanceof require('stream').Readable) { 
              let chunks = [];
              errorData.on('data', chunk => chunks.push(chunk));
              errorData.on('end', () => {
                  const errorString = Buffer.concat(chunks).toString();
                  console.error("[Server] Gemini error response (streamed):", errorString);
                  try {
                      const parsedError = JSON.parse(errorString);
                      errorMessage = parsedError.error ? (parsedError.error.message || errorString) : errorString;
                  } catch (parseErr) {
                      errorMessage = errorString;
                  }
                  if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
                    res.write('data: {"event": "EOS"}\n\n');
                    res.end();
                  }
              });
              return; 
          } else {
               console.error("[Server] Gemini error response (data):", errorData);
               if(errorData.error && errorData.error.message) {
                   errorMessage = errorData.error.message;
               } else if (typeof errorData === 'string') {
                   errorMessage = errorData;
               } else if (err.message) {
                   errorMessage = err.message;
               }
          }
      } else if (err.message) {
          errorMessage = err.message;
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.write('data: {"event": "EOS"}\n\n'); 
        res.end();
      }
    }
  }
});

// Middleware to catch 404 errors
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Optional: Basic error handler for other errors (e.g., 500)
// This should be the last middleware
app.use((err, req, res, next) => {
  console.error("[Server Error Handler]", err.stack);
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).send(err.message || 'Something broke on the server!');
});

app.listen(3000, () => console.log('Server running on port 3000'));
