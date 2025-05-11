const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const path = require('path'); // Added for serving static files

// Helper function to perform the HTML stripping (copied from api/generate.js logic)
function processGeneratedHtml(combinedHtml) {
  if (!combinedHtml) return "";
  console.log("[Server] Original combinedHtml (first 500 chars):", combinedHtml.substring(0, 500) + (combinedHtml.length > 500 ? "..." : ""));
  
  let finalHtml = "";
  const htmlRegex = /<(!DOCTYPE html|html)[\s\S]*?<\/html>/i;
  const match = combinedHtml.match(htmlRegex);
  
  if (match && match[0]) {
    finalHtml = match[0];
    console.log("[Server] HTML extracted using primary regex. Length:", finalHtml.length);
  } else {
    console.warn("[Server] Primary regex did not match. Trying to find content within markdown fences.");
    let contentToTest = combinedHtml;
    const fenceHtmlRegex = /```html\s*([\s\S]*?)\s*```/i;
    const fenceGenericRegex = /```\s*([\s\S]*?)\s*```/i;

    let fenceMatch = contentToTest.match(fenceHtmlRegex);
    if (fenceMatch && fenceMatch[1]) {
      contentToTest = fenceMatch[1].trim();
      console.log("[Server] Extracted content from ```html fences. Length:", contentToTest.length);
    } else {
      fenceMatch = contentToTest.match(fenceGenericRegex);
      if (fenceMatch && fenceMatch[1]) {
        contentToTest = fenceMatch[1].trim();
        console.log("[Server] Extracted content from generic ``` fences. Length:", contentToTest.length);
      } else {
        console.warn("[Server] No markdown fences found or content within them is empty. Using original combinedHtml (trimmed) for final check.");
        contentToTest = combinedHtml.trim();
      }
    }
    
    const secondMatch = contentToTest.trim().match(htmlRegex);
    if (secondMatch && secondMatch[0]) {
        finalHtml = secondMatch[0];
        console.log("[Server] HTML extracted using primary regex on de-fenced content. Length:", finalHtml.length);
    } else if (contentToTest.toLowerCase().startsWith("<!doctype html") || contentToTest.toLowerCase().startsWith("<html")) {
        const endTag = "</html>";
        const endIdx = contentToTest.toLowerCase().lastIndexOf(endTag);
        if (endIdx !== -1 && (endIdx + endTag.length) <= contentToTest.length) {
            finalHtml = contentToTest.substring(0, endIdx + endTag.length);
        } else {
            finalHtml = contentToTest;
        }
        console.log("[Server] Using content (post-fence check) as it starts like HTML. Length:", finalHtml.length);
    } else {
        console.error("[Server] Failed to extract clean HTML even after fallback. Sending original combined (but trimmed) content.");
        finalHtml = combinedHtml.trim(); 
    }
  }
  return finalHtml.trim();
}
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

  const prompt = req.query.prompt; // This will be the edit instruction if isEdit is true
  const apiKey = req.query.apiKey; // Get API key from query parameter
  const engine = req.query.engine || 'gemini'; // Default to gemini
  const isEdit = req.query.isEdit === 'true';
  const currentHtml = req.query.currentHtml; // Existing HTML for edit mode

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

  const systemPromptText = "You are Zerocoder, an advanced HTML code generation engine. Your output MUST be a single, complete, and valid HTML document using Tailwind CSS (via CDN in the <head>). All designs must be responsive, visually appealing, and follow modern UI/UX best practices.\\n\\nFor any image content, if no suitable external image is available, generate SVG graphics directly within the HTML. The SVGs should be simple, clean, and vector-based to fit the content needs (e.g., icons, logos, or abstract patterns). These SVGs should be visually appropriate for the section of the site they appear in and should follow best design principles (e.g., minimalistic icons, geometric shapes, or abstract art for backgrounds).\\n\\nUse high-quality placeholder services like Lorem Picsum or Unsplash Source for images when necessary, but prioritize SVGs when appropriate.\\n\\nYour initial response must contain ONLY raw HTML. Start exactly with <!DOCTYPE html> and end with </html>. No markdown, comments, or extra characters are allowed—just clean, production-ready HTML.\\n\\n**VERY IMPORTANT EDITING INSTRUCTIONS (APPLY IF 'Existing HTML' IS PROVIDED):**\\nWhen an 'Edit Instruction' is provided along with 'Existing HTML':\\n1.  **DO NOT REWRITE OR REGENERATE THE ENTIRE HTML DOCUMENT.** Your primary goal is to make a *targeted modification*.\\n2.  Treat the 'Existing HTML' as the definitive source code.\\n3.  Analyze the 'Edit Instruction' to understand the specific change requested (e.g., change text, color, add/remove an element, modify an attribute).\\n4.  Locate the *exact* HTML element(s) or section(s) in the 'Existing HTML' that the 'Edit Instruction' refers to.\\n5.  Modify ONLY that specific part of the 'Existing HTML'. All other parts, lines, and structures of the 'Existing HTML' MUST be preserved exactly as they were and in their original order and position.\\n6.  Imagine you are applying a small patch or diff to the 'Existing HTML'.\\n7.  After making the precise, minimal modification, your output MUST be the *entire, complete, and valid HTML document*, which includes your targeted change integrated into the original, otherwise unchanged, 'Existing HTML'.\\n8.  DO NOT output only the changed snippet. Do NOT include any explanations, apologies, markdown, or any text other than the full HTML document. Start exactly with `<!DOCTYPE html>` and ending exactly with `</html>`.\\n\\nRepeat this edit cycle until the user confirms the final version.";

  let userContentForModel = prompt; // This is the edit instruction if isEdit, or the initial prompt

  if (isEdit && currentHtml) {
    if (engine === 'lmstudio') {
      userContentForModel = `Instruction: "${prompt}"\n\nCarefully update the following HTML based *only* on the instruction above. Preserve all unchanged parts. Output the complete modified HTML only.\n\nHTML to modify:\n---\n${currentHtml}\n---`;
    } else { // For Gemini or other engines
      userContentForModel = `Existing HTML:\n---\n${currentHtml}\n---\nEdit Instruction:\n${prompt}`;
    }
    console.log(`[Server] Edit mode. Combined content for model (first 200 chars): ${userContentForModel.substring(0,200)}...`);
  } else {
    console.log(`[Server] New generation mode. Prompt: "${prompt}"`);
  }

  if (engine === 'lmstudio') {
    const lmstudioNoThink = req.query.lmstudio_no_think === 'true';
    let finalPayloadForLmStudio = userContentForModel; // Already incorporates edit logic
    if (lmstudioNoThink) {
      finalPayloadForLmStudio = `${userContentForModel} /no_think`; // Append /no_think if needed
      console.log(`[Server] LM Studio 'no_think' is enabled. Modified payload for LM Studio: "${finalPayloadForLmStudio.substring(0,100)}..."`);
    } else {
      console.log(`[Server] LM Studio 'no_think' is disabled. Original payload for LM Studio: "${finalPayloadForLmStudio.substring(0,100)}..."`);
    }
    console.log(`[Server] Attempting to stream from LM Studio with payload (first 100 chars): "${finalPayloadForLmStudio.substring(0,100)}..."`);
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
          { role: "user", content: finalPayloadForLmStudio }
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
          parts: [{ text: userContentForModel }]  // Use userContentForModel which includes edits if applicable
        }],
        system_instruction: {         // Official field for system instructions
          parts: [{ text: systemPromptText }]
        }
      };

      console.log(`[Server] Attempting to stream from Gemini. Payload (first 100 chars of user content): "${userContentForModel.substring(0,100)}..."`);
      const geminiResponse = await axios.post(geminiStreamUrl, geminiPayload, {
        responseType: 'stream'
      });
      
      let jsonBuffer = '';

      geminiResponse.data.on('data', (chunk) => {
        jsonBuffer += chunk.toString();
        // Removed problematic parsing from here; accumulation only.
      });

      geminiResponse.data.on('end', () => {
        console.log("[Server] Gemini stream ended. Accumulated data length:", jsonBuffer.length);
        try {
          const responsesArray = JSON.parse(jsonBuffer);
          let combinedHtml = "";
          for (const responseObject of responsesArray) {
            if (responseObject.candidates && responseObject.candidates[0] &&
                responseObject.candidates[0].content && responseObject.candidates[0].content.parts &&
                responseObject.candidates[0].content.parts[0] && responseObject.candidates[0].content.parts[0].text) {
              combinedHtml += responseObject.candidates[0].content.parts[0].text;
            } else if (responseObject.error) {
              console.error("[Server] Error object in Gemini response array:", responseObject.error);
              if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: responseObject.error.message || 'Error in Gemini response object' })}\n\n`);
            }
          }
          
          const finalHtml = processGeneratedHtml(combinedHtml); // Use the helper function

          if (finalHtml) {
            console.log("[Server] Sending processed Gemini HTML to client. Length:", finalHtml.length);
            if (!res.writableEnded) res.write(`data: ${JSON.stringify({ htmlChunk: finalHtml })}\n\n`);
          } else if (responsesArray.length === 0 && !jsonBuffer.includes("error")) {
               console.log("[Server] Gemini response array was empty, no HTML content from buffer.");
          }
        } catch (e) {
          console.error("[Server] Error parsing accumulated Gemini JSON response from buffer:", e.message);
          console.error("[Server] Buffer content that failed to parse (first 500 chars):", jsonBuffer.substring(0, 500));
          if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: "Failed to parse the full response from Gemini." })}\n\n`);
        }
        
        if (!res.writableEnded) res.write('data: {"event": "EOS"}\n\n');
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
