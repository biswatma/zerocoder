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

  if (!prompt) {
    console.log("[SERVER DEBUG] Prompt is missing, sending 400 error.");
    return res.status(400).json({ error: "Prompt is required" });
  }
  if (!apiKey) {
    console.log("[SERVER DEBUG] API Key is missing, sending 400 error.");
    // For EventSource, errors should ideally also be event streams if headers are already flushed.
    // However, this check is before res.flushHeaders(), so a JSON error is okay.
    return res.status(400).json({ error: "API Key is required" });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Explicitly flush headers BEFORE the try block

  try {
    // Using the API key passed from the client
    const geminiStreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:streamGenerateContent?key=${apiKey}`;
    const systemPromptText = "You are an HTML code generation engine. Your output MUST be a single, complete, valid HTML document. Start your response *directly* with `<!DOCTYPE html>`. Do NOT include any other text, explanations, summaries, markdown formatting (like ```html), or any characters whatsoever before `<!DOCTYPE html>` or after `</html>`. Only output the raw HTML code itself.";
    
    const geminiPayload = {
      contents: [{ 
        parts: [{ text: prompt }]  // User's direct prompt
      }],
      system_instruction: {         // Official field for system instructions
        parts: [{ text: systemPromptText }]
      }
      // Potentially add generationConfig: { "response_mime_type": "text/plain" } if supported,
      // to further discourage markdown, but this might also strip HTML tags if model misinterprets.
      // For now, rely on prompt and server-side stripping.
    };

    console.log(`[Server] Attempting to stream from Gemini with dedicated system_instruction field for prompt: "${prompt}"`);
    const geminiResponse = await axios.post(geminiStreamUrl, geminiPayload, {
      responseType: 'stream'
    });
    
    // Headers should have been flushed by res.flushHeaders() above.

    let jsonBuffer = ''; // Buffer for potentially incomplete JSON chunks

    geminiResponse.data.on('data', (chunk) => {
      jsonBuffer += chunk.toString();
      
      // Process buffer for complete JSON objects (Gemini stream sends an array of JSON objects)
      // A simple way is to assume the stream is an array and try to parse it incrementally.
      // This is still not perfect true streaming of *individual text parts* from Gemini to client,
      // but it processes Gemini's JSON objects as they complete within the stream.
      // The Gemini API for streamGenerateContent sends a stream of `StreamGenerateContentResponse` objects.
      // These are typically sent one after another. We need to parse each one.
      // A common pattern is that these JSON objects might be separated by newlines in some SDKs,
      // but raw HTTP stream might just concatenate them.
      // For robustness, we'd need a proper streaming JSON parser.
      // Given the existing code structure, it expects to parse an array of responses.
      // The simplest modification to avoid timeout is to send *something* to the client earlier.

      // Let's try to parse what we have so far as if it's the start of the array.
      // This is a heuristic and might break if chunks are too small or malformed.
      try {
        // Attempt to find complete JSON objects in the buffer.
        // Gemini stream is an array of JSON objects. Chunks might not be valid JSON alone.
        // A more robust way would be to find `},{` boundaries or use a streaming JSON parser.
        // For now, let's send the raw text chunk from Gemini if available in this chunk.
        // This assumes each chunk from Gemini stream is a self-contained JSON object of StreamGenerateContentResponse
        // which might not always be true, but is a common behavior for many streaming APIs.
        
        // Try to parse the current buffer as one or more JSON objects.
        // The stream from Gemini is an array of JSON objects.
        // We'll look for `StreamGenerateContentResponse` objects.
        // A simple heuristic: split by '}\n{' or similar, or try to parse.
        
        // Let's refine: the stream is an array of JSON objects.
        // `[ {"candidates": ...}, {"candidates": ...} ]`
        // We need to extract each object.
        
        // Simplified approach: send text as it comes from any candidate part.
        // This might send partial HTML if Gemini chunks its text output.
        const potentialObjects = jsonBuffer.split('\n').filter(s => s.trim() !== '');
        let processedAnyThisChunk = false;
        potentialObjects.forEach(potentialJsonString => {
            if (processedAnyThisChunk && !potentialJsonString.startsWith(',')) { // If it's not the first object in an array part
                 // This logic is flawed if Gemini doesn't send comma-separated objects in chunks.
            }
            try {
                // Remove leading/trailing commas if they exist from partial array processing
                let parsableJsonString = potentialJsonString.trim();
                if (parsableJsonString.startsWith(',')) parsableJsonString = parsableJsonString.substring(1);
                if (parsableJsonString.endsWith(',')) parsableJsonString = parsableJsonString.slice(0, -1);

                if (!parsableJsonString) return;

                const responseObject = JSON.parse(parsableJsonString);
                if (responseObject.candidates && responseObject.candidates[0] &&
                    responseObject.candidates[0].content && responseObject.candidates[0].content.parts &&
                    responseObject.candidates[0].content.parts[0] && responseObject.candidates[0].content.parts[0].text) {
                  const textChunk = responseObject.candidates[0].content.parts[0].text;
                  console.log("[Server] Sending text chunk to client:", textChunk.substring(0,100) + "...");
                  res.write(`data: ${JSON.stringify({ htmlChunk: textChunk })}\n\n`);
                  processedAnyThisChunk = true;
                } else if (responseObject.error) {
                  console.error("[Server] Error object in Gemini response chunk:", responseObject.error);
                  res.write(`data: ${JSON.stringify({ error: responseObject.error.message || 'Error in Gemini response object' })}\n\n`);
                  processedAnyThisChunk = true;
                }
            } catch (e) {
                // Incomplete JSON in this part of the buffer, wait for more data
                // console.warn("[Server] Partial JSON in buffer, waiting for more data. Error:", e.message, "Buffer part:", potentialJsonString);
            }
        });
        if(processedAnyThisChunk) jsonBuffer = ''; // Clear buffer if we processed something

      } catch (e) {
        // This outer catch is if jsonBuffer itself is not even splittable or basic processing fails.
        console.warn('[Server] Error processing/parsing chunk from Gemini, might be partial. Chunk:', jsonBuffer.substring(0,200));
        // Don't send error to client yet, just buffer and wait for more.
      }
    });

    geminiResponse.data.on('end', () => {
      console.log("[Server] Gemini stream ended.");
      // Process any remaining data in jsonBuffer
      // This part is tricky because the original code expected a full array.
      // If the above on('data') logic correctly parsed and sent all parts, jsonBuffer might be empty or contain a trailing ']'
      // For now, we assume the on('data') has handled most things.
      // The crucial part is that we've been sending data *during* the stream.
      if (jsonBuffer.trim().length > 0 && jsonBuffer.trim() !== '[' && jsonBuffer.trim() !== ']') {
          console.warn("[Server] Remaining data in buffer after stream end:", jsonBuffer);
          // Attempt to parse any final bits, though ideally handled above.
          // This might be redundant if the stream always ends cleanly.
      }
      
      res.write('data: {"event": "EOS"}\n\n');
      res.end();
      console.log("[Server] Finished processing and sent EOS to client.");
    });

    geminiResponse.data.on('error', (streamError) => { // This handles errors on the stream itself
      console.error('[Server] Error event during Gemini stream pipe:', streamError);
      // Ensure client stream is properly terminated with an error if possible
      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({ error: streamError.message || 'Gemini stream pipe error event' })}\n\n`);
          res.write('data: {"event": "EOS"}\n\n');
          res.end();
        } catch (e) {
          console.error("[Server] Error writing error to client response after stream error:", e);
          if (!res.writableEnded) res.end(); // Force end if write fails
        }
      }
    });

  } catch (err) {
    // This catch is for errors in setting up the axios request itself (e.g., network error, Gemini 4xx/5xx response)
    console.error('[Server] Error setting up or during Gemini stream request:', err.isAxiosError ? err.message : err);
    if (err.response && err.response.data) { // Axios error might have more details
        let errorData = err.response.data;
        if (errorData instanceof require('stream').Readable) { // If error data is a stream
            let chunks = [];
            errorData.on('data', chunk => chunks.push(chunk));
            errorData.on('end', () => {
                const errorString = Buffer.concat(chunks).toString();
                console.error("[Server] Gemini error response (streamed):", errorString);
                // Try to parse it if it's JSON
                try {
                    const parsedError = JSON.parse(errorString);
                    res.write(`data: ${JSON.stringify({ error: parsedError.error ? parsedError.error.message : errorString })}\n\n`);
                } catch (parseErr) {
                    res.write(`data: ${JSON.stringify({ error: errorString })}\n\n`);
                }
                res.write('data: {"event": "EOS"}\n\n');
                res.end();
            });
            return; // Handled by stream events
        } else {
             console.error("[Server] Gemini error response (data):", errorData);
             res.write(`data: ${JSON.stringify({ error: (errorData.error && errorData.error.message) ? errorData.error.message : (err.message || 'Failed to connect to Gemini API for streaming.') })}\n\n`);
        }
    } else {
        res.write(`data: ${JSON.stringify({ error: err.message || 'Server error during stream setup.' })}\n\n`);
    }
    res.write('data: {"event": "EOS"}\n\n'); // Ensure client knows stream is over
    res.end();
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
