<p align="center">
  <img src="public/assets/logo.png" alt="ZeroCoder Logo" width="150">
</p>

# ZeroCoder - AI Web Generator

**Try the Live Demo:**  
👉 [Click here to open Zerocoder Live Demo](https://zerocoder-zeta.vercel.app/) (opens in same tab — right-click to open in new tab)


## Demo Video

[![ZeroCoder Demo Video](./public/zerocoder-overlay.png)](https://youtu.be/J0zxpeXcN9M)

*(Click the image above to watch the demo on YouTube)*


---

ZeroCoder is a web application that allows you to generate HTML websites based on text prompts using the Google Gemini API. It features a split UI with a prompt input and code editor on one side, and a live preview iframe on the other.

# Zerocoder Projects

This repository lists websites built using the **Zerocoder** tool.

## Live Projects
1. 🔗 [SEO Audit Tool](https://biswatma.github.io/seoaudit/)  
   A web-based SEO audit interface prototype.

2. 🔗 [TicketHub (Gemini)](https://biswatma.github.io/tickethub-gemini/)  
   A user-friendly ticket booking interface developed with AI design assistance.

3. 🔗 [Resell Ticket (LM Studio)](https://biswatma.github.io/resellticket-lmstudio/)  
   A minimalistic ticket reselling platform concept.
4. 🔗 [AquaPure (Gemini) ](https://biswatma.github.io/aquapure/)  
   A minimalistic ecom site for buying drinking water.
---

These projects are built and deployed using GitHub Pages. Designed with the **Zerocoder** no-code/low-code tool for rapid prototyping.




## Features

-   **AI-Powered Code Generation**: Uses Google Gemini to convert natural language prompts into HTML, CSS, and JavaScript code.
-   **Live Code Editor**: Monaco editor for viewing and editing the generated HTML.
-   **Live Preview**: An iframe updates in real-time to show the rendered website as the code changes in the editor (though current server implementation sends code all at once).
-   **Dark Theme with Glassmorphism**: Modern and rich user interface.
-   **Client-Side API Key Management**: Users can enter, save (in browser localStorage), and clear their own Gemini API key.
-   **Download HTML**: Option to download the generated HTML code as a file.
-   **Preview in New Tab**: Option to open the generated HTML in a new browser tab for a full-page preview.
-   **Loading State**: Shows a loader and message during code generation.
-   **LM Studio Integration**: Supports generating websites using a locally running LM Studio instance.

## Using with LM Studio (Local AI)

ZeroCoder can connect to a local LM Studio instance, allowing you to use models running on your own computer for HTML generation.

**1. Download and Install LM Studio:**
   - If you haven't already, download LM Studio from [lmstudio.ai](https://lmstudio.ai/) and install it on your computer.

**2. Download a Model in LM Studio:**
   - Open LM Studio.
   - Go to the "Search" tab (magnifying glass icon).
   - Search for a model suitable for code generation (e.g., models from Code Llama, DeepSeek Coder, Qwen, etc.).
   - Download your chosen model. Ensure it's fully downloaded.

**3. Start the Local Server in LM Studio:**
   - Go to the "Local Server" tab (server icon, usually `</>`).
   - In the top-middle, select the model you downloaded and want to use. Wait for it to load (you'll see a progress bar and then "Model loaded").
   - Once the model is loaded, click the "Start Server" button.
   - By default, LM Studio starts its server on `http://localhost:1234`.

**4. Configure ZeroCoder for LM Studio:**
   - In the ZeroCoder web application (running locally or the live demo):
     - Find the "Generation Engine" dropdown.
     - Select "LM Studio (Local)" from the dropdown.
     - The "Gemini API Key" section will hide, as it's not needed for LM Studio.
   - **Optional: Disable Model Thinking:**
     - A checkbox "Disable Model Thinking (appends /no_think)" will appear.
     - Some models (like certain versions of Qwen, e.g., `qwen3-30b-a3b:2` has been tested by users) might include their internal "thinking" process in the output. If this happens, checking this box will append `/no_think` to your prompt, which can help suppress these artifacts. By default, this option is unchecked (thinking is allowed).
   - **Optional: Advanced Configuration (via `.env` file for local server):**
     - If your LM Studio server is running on a different URL or port, or if you want to specify a particular model filename for LM Studio to use (though usually selecting it in the LM Studio UI is sufficient), you can configure this in the `.env` file in the ZeroCoder project root:
       ```env
       # Optional: LM Studio Configuration
       LMSTUDIO_URL=http://localhost:1234/v1/chat/completions
       # LMSTUDIO_MODEL=your-model-filename.gguf # Uncomment and set if needed
       ```
     - The application will use these environment variables if set when running the ZeroCoder server locally.

**5. Generate with LM Studio:**
   - Enter your prompt in ZeroCoder.
   - Click "Generate".
   - ZeroCoder will now send the request to your local LM Studio instance.
   - The preview iframe will update progressively (with a debounce to reduce blinking, and a 5-second interval refresh as a fallback) to show the website being built.

**Troubleshooting LM Studio Connection:**
   - Ensure the LM Studio server is running and a model is loaded and selected.
   - Check the ZeroCoder server console (the terminal where you ran `node server.js`) for any error messages related to connecting to LM Studio.
   - Verify the `LMSTUDIO_URL` in your `.env` file (if used) matches the URL shown in the LM Studio server tab.

## Tech Stack

-   **Frontend**: HTML, CSS, Vanilla JavaScript
-   **Code Editor**: Monaco Editor
-   **Backend**: Node.js with Express
-   **AI Model**: Google Gemini API (model `gemini-2.5-pro-exp-03-25` via REST API)

## Local Setup and Running

Follow these steps to run ZeroCoder locally on your machine:

**1. Prerequisites:**
   - Node.js and npm (Node Package Manager) installed. You can download them from [nodejs.org](https://nodejs.org/).
   - A Google Gemini API Key. You can obtain one from [Google AI Studio](https://aistudio.google.com/apikey).

**2. Clone the Repository (Manual Step):**
   *(You will need to do this step manually after pushing the code to your GitHub repository)*
   ```bash
   git clone https://github.com/biswatma/zerocoder.git
   cd zerocoder 
   ```
   *(Assuming the project files are in the root of this repository, or adjust `cd` path accordingly if `vibesite` is the root)*
   
   If the `vibesite` folder is the actual root of your Git repository, then after cloning, you would directly be in the project folder containing `server.js`, `public/`, etc. If `vibesite` is a subfolder within your Git repo, then `cd vibesite` after cloning. For these instructions, we'll assume `vibesite` is the main project folder you `cd` into.

**3. Navigate to Project Directory:**
   Make sure your terminal is in the `vibesite` project directory (the one containing `server.js`, `public/`, etc.).
   ```bash
   cd path/to/your/vibesite 
   ```
   *(Adjust this path if your structure is different after cloning)*

**4. Install Dependencies:**
   In the `vibesite` directory, run the following command to install the necessary Node.js packages (Express, Axios, CORS, DotEnv):
   ```bash
   npm install
   ```

**5. Run the Server (Manual / All Platforms):**
   Once dependencies are installed, you can start the Node.js server directly:
   ```bash
   node server.js
   ```
   You should see a message in your terminal: `Server running on port 3000`.

**6. Run the Server (macOS/Linux One-Click Launcher):**
   For a convenient way to start the server on macOS or Linux:
      - Navigate to the project directory in your terminal.
      - Make the script executable (if you haven't already): `chmod +x start_server.sh`
      - Run the script: `./start_server.sh`
      - This will open a command prompt window. It will automatically install dependencies if the `node_modules` folder is missing and then start the server.
      - Look for the "Server running on port 3000" message in the terminal.
      - To stop the server, you can press `Ctrl+C` in the terminal window.

**7. Run the Server (Windows One-Click Launcher):**
   For a convenient way to start the server on Windows:
      - Navigate to the project directory in your File Explorer.
      - Double-click the `start_server.bat` file.
      - This will open a command prompt window. It will automatically install dependencies if the `node_modules` folder is missing and then start the server.
      - Look for the "Server running on port 3000" message in the command prompt.
      - To stop the server, you can press `Ctrl+C` in the command prompt window or simply close it.

**8. Access the Application:**
   Open your web browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

**9. Configure API Key in the UI:**
   - When you first open the application, you'll see a section for the Gemini API Key.
   - Paste your Gemini API key into the input field.
   - Click "Save Key". This will store the key in your browser's local storage for future sessions.
   - The application will now use this key to communicate with the Gemini API.

**10. Generate a Website:**
   - Enter a prompt describing the website you want to create (e.g., "a landing page for a coffee shop").
   - Click the "Generate" button.
   - The loader will appear. Wait for the generation to complete.
   - The generated HTML code will appear in the editor on the left, and the live preview will render on the right.

**11. Use Other Features:**
   - **Download HTML**: Click to download the current HTML from the editor.
   - **Preview in New Tab**: Click to open the current HTML in a new browser tab.
   - **Clear/Edit Key**: Use these buttons in the API key section to manage your saved key.

## Important Notes

-   The application currently sends the API key from the client to the server with each request. While this allows users to use their own keys easily, be mindful of the security implications if this were a publicly deployed production application without further safeguards.
-   The server currently accumulates the full response from Gemini before sending it to the client, so the "live typing" effect in the editor is not present; code appears all at once.
-   The `.env` file in this project is not used for the Gemini API key by the server if the client provides one (which it's designed to do).

Enjoy using ZeroCoder!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
