// Helper function to perform the HTML stripping (copied from server.js logic)
function processGeneratedHtml(combinedHtml) {
  if (!combinedHtml) return "";
  console.log("[Vercel Function] Original combinedHtml (first 500 chars):", combinedHtml.substring(0, 500) + (combinedHtml.length > 500 ? "..." : ""));
  
  let finalHtml = "";
  const htmlRegex = /<(!DOCTYPE html|html)[\s\S]*?<\/html>/i;
  const match = combinedHtml.match(htmlRegex);
  
  if (match && match[0]) {
    finalHtml = match[0];
    console.log("[Vercel Function] HTML extracted using primary regex. Length:", finalHtml.length);
  } else {
    console.warn("[Vercel Function] Primary regex did not match. Trying to find content within markdown fences.");
    let contentToTest = combinedHtml;
    const fenceHtmlRegex = /```html\s*([\s\S]*?)\s*```/i;
    const fenceGenericRegex = /```\s*([\s\S]*?)\s*```/i;

    let fenceMatch = contentToTest.match(fenceHtmlRegex);
    if (fenceMatch && fenceMatch[1]) {
      contentToTest = fenceMatch[1].trim();
      console.log("[Vercel Function] Extracted content from ```html fences. Length:", contentToTest.length);
    } else {
      fenceMatch = contentToTest.match(fenceGenericRegex);
      if (fenceMatch && fenceMatch[1]) {
        contentToTest = fenceMatch[1].trim();
        console.log("[Vercel Function] Extracted content from generic ``` fences. Length:", contentToTest.length);
      } else {
        console.warn("[Vercel Function] No markdown fences found or content within them is empty. Using original combinedHtml (trimmed) for final check.");
        contentToTest = combinedHtml.trim();
      }
    }
    
    const secondMatch = contentToTest.trim().match(htmlRegex);
    if (secondMatch && secondMatch[0]) {
        finalHtml = secondMatch[0];
        console.log("[Vercel Function] HTML extracted using primary regex on de-fenced content. Length:", finalHtml.length);
    } else if (contentToTest.toLowerCase().startsWith("<!doctype html") || contentToTest.toLowerCase().startsWith("<html")) {
        const endTag = "</html>";
        const endIdx = contentToTest.toLowerCase().lastIndexOf(endTag);
        if (endIdx !== -1 && (endIdx + endTag.length) <= contentToTest.length) {
            finalHtml = contentToTest.substring(0, endIdx + endTag.length);
        } else {
            finalHtml = contentToTest;
        }
        console.log("[Vercel Function] Using content (post-fence check) as it starts like HTML. Length:", finalHtml.length);
    } else {
        console.error("[Vercel Function] Failed to extract clean HTML even after fallback. Sending original combined (but trimmed) content.");
        finalHtml = combinedHtml.trim(); 
    }
  }
  return finalHtml.trim();
}


module.exports = async (req, res) => {
  console.log("[Vercel Function] /api/generate invoked.");

  const prompt = req.query.prompt; // This will be the edit instruction if isEdit is true
  const isEdit = req.query.isEdit === 'true';
  const currentHtml = req.query.currentHtml; // Existing HTML for edit mode

  // Prioritize Vercel environment variable for API key, fallback to query param if needed (less secure)
  const apiKeyFromEnv = process.env.GEMINI_API_KEY;
  const apiKeyFromQuery = req.query.apiKey;

  if (!prompt) {
    console.log("[Vercel Function] Prompt is missing.");
    return res.status(400).json({ error: "Prompt is required" });
  }

  const apiKeyToUse = apiKeyFromEnv || apiKeyFromQuery;
  if (!apiKeyToUse) {
    console.log("[Vercel Function] API Key is missing (checked env and query).");
    return res.status(400).json({ error: "API Key is required" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Vercel handles flushing headers automatically on first write or if explicitly called.
  // res.flushHeaders(); // Optional: Explicitly flush if needed, but often not necessary.

  try {
    const geminiStreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:streamGenerateContent?key=${apiKeyToUse}`;
    const systemPromptText = "You are Zerocoder, an advanced HTML code generation engine. Your output MUST be a single, complete, and valid HTML document using Tailwind CSS (via CDN in the <head>). All designs must be responsive, visually appealing, and follow modern UI/UX best practices.\\n\\nFor any image content, if no suitable external image is available, generate SVG graphics directly within the HTML. The SVGs should be simple, clean, and vector-based to fit the content needs (e.g., icons, logos, or abstract patterns). These SVGs should be visually appropriate for the section of the site they appear in and should follow best design principles (e.g., minimalistic icons, geometric shapes, or abstract art for backgrounds).\\n\\nUse high-quality placeholder services like Lorem Picsum or Unsplash Source for images when necessary, but prioritize SVGs when appropriate.\\n\\nYour initial response must contain ONLY raw HTML. Start exactly with <!DOCTYPE html> and end with </html>. No markdown, comments, or extra characters are allowed—just clean, production-ready HTML.\\n\\n**IMPORTANT EDITING INSTRUCTIONS:**\\nWhen an 'Edit Instruction' is provided along with 'Existing HTML':\\n1.  You MUST treat the 'Existing HTML' as the source document.\\n2.  You MUST NOT regenerate the entire HTML document from scratch.\\n3.  Your goal is to make the MINIMAL necessary change to the 'Existing HTML' to satisfy the 'Edit Instruction'.\\n4.  Identify the specific HTML element(s) or section(s) targeted by the 'Edit Instruction'.\\n5.  Modify ONLY that specific part. All other parts of the 'Existing HTML' MUST be preserved exactly as they were.\\n6.  After making the precise modification, your output MUST be the *entire, complete, and valid HTML document*, which includes your targeted change integrated into the original, otherwise unchanged, 'Existing HTML'.\\n7.  Do NOT output only the changed snippet. Do NOT include any explanations, apologies, or markdown. Output ONLY the full, modified HTML document starting with `<!DOCTYPE html>` and ending with `</html>`.\\n\\nRepeat this edit cycle until the user confirms the final version.";
    
    let requestText = prompt; // Default to the original prompt for new generation
    if (isEdit && currentHtml) {
      requestText = `Existing HTML:\n---\n${currentHtml}\n---\nEdit Instruction:\n${prompt}`;
      console.log("[Vercel Function] Edit mode detected. Combined text for Gemini:", requestText.substring(0, 200) + "...");
    } else {
      console.log(`[Vercel Function] Attempting to stream from Gemini for prompt: "${prompt}"`);
    }
    
    const geminiPayload = {
      contents: [{ parts: [{ text: requestText }] }],
      system_instruction: { parts: [{ text: systemPromptText }] }
    };

    console.log(`[Vercel Function] Sending payload to Gemini via fetch.`);
    const fetchResponse = await fetch(geminiStreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiPayload),
    });

    if (!fetchResponse.ok) {
      let errorBody = 'Unknown fetch error';
      try {
        errorBody = await fetchResponse.text(); // Try to get more details
        console.error(`[Vercel Function] Gemini fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`, errorBody);
      } catch (e) {
         console.error(`[Vercel Function] Gemini fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}. Could not read error body.`);
      }
      throw new Error(`Gemini API request failed with status ${fetchResponse.status}: ${errorBody}`);
    }

    if (!fetchResponse.body) {
        throw new Error("Fetch response body is null.");
    }

    const reader = fetchResponse.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedData = '';
    let reading = true;

    while(reading) {
        const { done, value } = await reader.read();
        if (done) {
            reading = false;
            break;
        }
        accumulatedData += decoder.decode(value, { stream: true });
    }
    // Append final chunk if decoder has leftovers
    accumulatedData += decoder.decode(); 

    console.log("[Vercel Function] Gemini stream ended via fetch. Total data length:", accumulatedData.length);
    try {
      // Gemini stream returns a JSON array as the full response body
      const responsesArray = JSON.parse(accumulatedData);
      let combinedHtml = "";
      for (const responseObject of responsesArray) {
        if (responseObject.candidates && responseObject.candidates[0] &&
            responseObject.candidates[0].content && responseObject.candidates[0].content.parts &&
            responseObject.candidates[0].content.parts[0] && responseObject.candidates[0].content.parts[0].text) {
          combinedHtml += responseObject.candidates[0].content.parts[0].text;
        } else if (responseObject.error) {
          console.error("[Vercel Function] Error object in Gemini response array:", responseObject.error);
          if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: responseObject.error.message || 'Error in Gemini response object' })}\n\n`);
        }
      }
      
      const finalHtml = processGeneratedHtml(combinedHtml);

      if (finalHtml) {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify({ htmlChunk: finalHtml })}\n\n`);
      } else if (responsesArray.length === 0 && !accumulatedData.includes("error")) {
           console.log("[Vercel Function] Gemini response array was empty, no HTML content.");
      }
    } catch (e) {
      console.error("[Vercel Function] Error parsing accumulated Gemini JSON response:", e.message);
      console.error("[Vercel Function] Accumulated data (first 500 chars):", accumulatedData.substring(0, 500));
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: "Failed to parse the full response from Gemini." })}\n\n`);
    }
    
    if (!res.writableEnded) {
      res.write('data: {"event": "EOS"}\n\n');
      res.end();
    }
    console.log("[Vercel Function] Finished processing and sent EOS to client.");

  } catch (err) {
    console.error('[Vercel Function] Error setting up or during Gemini fetch request/stream:', err);
    if (!res.writableEnded) {
      const errorMessage = err.message || 'Server error during fetch/stream processing.';
      
      // Check if headers already sent to decide response format
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.write('data: {"event": "EOS"}\n\n');
        res.end();
      } else {
        // Ensure SSE format for errors caught here too.
        if (!res.headersSent) { 
             res.setHeader('Content-Type', 'text/event-stream'); 
        }
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.write('data: {"event": "EOS"}\n\n');
        res.end();
      }
    }
  }
};
