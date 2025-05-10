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

    // Accumulate all data from Gemini stream, then parse and send.
    // This is not true streaming to the client, but handles the chunked JSON array from Gemini.
    let accumulatedData = '';
    geminiResponse.data.on('data', (chunk) => {
      accumulatedData += chunk.toString();
    });

    geminiResponse.data.on('end', () => {
      console.log("[Server] Gemini stream ended. Total data length:", accumulatedData.length);
      try {
        // The entire response from Gemini's streamGenerateContent is a JSON array.
        const responsesArray = JSON.parse(accumulatedData);
        
        let combinedHtml = "";
        for (const responseObject of responsesArray) {
          if (responseObject.candidates && responseObject.candidates[0] &&
              responseObject.candidates[0].content && responseObject.candidates[0].content.parts &&
              responseObject.candidates[0].content.parts[0] && responseObject.candidates[0].content.parts[0].text) {
            combinedHtml += responseObject.candidates[0].content.parts[0].text;
          } else if (responseObject.error) {
            console.error("[Server] Error object in Gemini response array:", responseObject.error);
            res.write(`data: ${JSON.stringify({ error: responseObject.error.message || 'Error in Gemini response object' })}\n\n`);
          }
        }
        
        if (combinedHtml) {
          console.log("[Server] Original combinedHtml (first 500 chars):", combinedHtml.substring(0, 500) + (combinedHtml.length > 500 ? "..." : ""));
          
          let finalHtml = "";
          // Regex to capture content between <!DOCTYPE html> or <html> and </html>
          // Made [\s\S]* non-greedy with *? to prefer the shortest match if multiple </html> tags exist (e.g. in comments)
          // but for a full document, it should capture the whole thing.
          const htmlRegex = /<(!DOCTYPE html|html)[\s\S]*?<\/html>/i; 
          const match = combinedHtml.match(htmlRegex);
          
          if (match && match[0]) {
            finalHtml = match[0];
            console.log("[Server] HTML extracted using primary regex. Length:", finalHtml.length);
          } else {
            // Fallback: If primary regex fails, try to find content within markdown fences
            // This is a multi-stage fallback.
            console.warn("[Server] Primary regex (<!doctype.../html...</html>) did not match. Trying markdown fence extraction.");
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
                contentToTest = combinedHtml.trim(); // Use original if no fences
              }
            }
            
            // After potentially stripping fences, check if the result *now* looks like an HTML document.
            // This is important if the fences contained the actual HTML.
            if (contentToTest.toLowerCase().startsWith("<!doctype html") || contentToTest.toLowerCase().startsWith("<html")) {
                // If it looks like HTML, try to ensure it ends with </html> if possible.
                const endTag = "</html>";
                const endIdx = contentToTest.toLowerCase().lastIndexOf(endTag);
                if (endIdx !== -1 && (endIdx + endTag.length) <= contentToTest.length) { // ensure endIdx is valid
                    finalHtml = contentToTest.substring(0, endIdx + endTag.length);
                } else {
                    finalHtml = contentToTest; // Use as is if </html> not found cleanly
                }
                console.log("[Server] Using content (post-fence check) as it starts like HTML. Length:", finalHtml.length);
            } else {
                console.error("[Server] Failed to extract clean HTML even after fallback. Sending original combined (but trimmed) content.");
                finalHtml = combinedHtml.trim(); // Absolute last resort
            }
          }

          if (finalHtml) {
            res.write(`data: ${JSON.stringify({ htmlChunk: finalHtml.trim() })}\n\n`);
          } else {
            console.log("[Server] No HTML content to send after processing.");
          }

        } else if (responsesArray.length === 0 && !accumulatedData.includes("error")) {
             console.log("[Server] Gemini response array was empty, no HTML content.");
        }


      } catch (e) {
        console.error("[Server] Error parsing accumulated Gemini JSON response:", e.message);
        console.error("[Server] Accumulated data (first 500 chars):", accumulatedData.substring(0, 500) + (accumulatedData.length > 500 ? "..." : ""));
        res.write(`data: ${JSON.stringify({ error: "Failed to parse the full response from Gemini." })}\n\n`);
      }
      
      res.write('data: {"event": "EOS"}\n\n');
      res.end();
      console.log("[Server] Finished processing and sent EOS to client.");
    });

    geminiResponse.data.on('error', (streamError) => {
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

app.listen(3000, () => console.log('Server running on port 3000'));
