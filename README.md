# ZeroCoder - AI Web Generator

ZeroCoder is a web application that allows you to generate HTML websites based on text prompts using the Google Gemini API. It features a split UI with a prompt input and code editor on one side, and a live preview iframe on the other.

## Features

-   **AI-Powered Code Generation**: Uses Google Gemini to convert natural language prompts into HTML, CSS, and JavaScript code.
-   **Live Code Editor**: Monaco editor for viewing and editing the generated HTML.
-   **Live Preview**: An iframe updates in real-time to show the rendered website as the code changes in the editor (though current server implementation sends code all at once).
-   **Dark Theme with Glassmorphism**: Modern and rich user interface.
-   **Client-Side API Key Management**: Users can enter, save (in browser localStorage), and clear their own Gemini API key.
-   **Download HTML**: Option to download the generated HTML code as a file.
-   **Preview in New Tab**: Option to open the generated HTML in a new browser tab for a full-page preview.
-   **Loading State**: Shows a loader and message during code generation.

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

**5. Run the Server:**
   Once dependencies are installed, start the Node.js server using one of the following methods:

   **a) Using Node.js directly (all platforms):**
      ```bash
      node server.js
      ```
      You should see a message in your terminal: `Server running on port 3000`.

   **### Windows One-Click Launcher (`start_server.bat`)**
      - Navigate to the project directory in your File Explorer.
      - Double-click the `start_server.bat` file.
      - This will open a command prompt window, automatically install dependencies if needed (the `node_modules` folder is missing), and then start the server.
      - Look for the "Server running on port 3000" message in the command prompt.
      - To stop the server, you can press `Ctrl+C` in the command prompt window or simply close it.

**6. Access the Application:**
   Open your web browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

**7. Configure API Key in the UI:**
   - When you first open the application, you'll see a section for the Gemini API Key.
   - Paste your Gemini API key into the input field.
   - Click "Save Key". This will store the key in your browser's local storage for future sessions.
   - The application will now use this key to communicate with the Gemini API.

**8. Generate a Website:**
   - Enter a prompt describing the website you want to create (e.g., "a landing page for a coffee shop").
   - Click the "Generate" button.
   - The loader will appear. Wait for the generation to complete.
   - The generated HTML code will appear in the editor on the left, and the live preview will render on the right.

**9. Use Other Features:**
   - **Download HTML**: Click to download the current HTML from the editor.
   - **Preview in New Tab**: Click to open the current HTML in a new browser tab.
   - **Clear/Edit Key**: Use these buttons in the API key section to manage your saved key.

## Important Notes

-   The application currently sends the API key from the client to the server with each request. While this allows users to use their own keys easily, be mindful of the security implications if this were a publicly deployed production application without further safeguards.
-   The server currently accumulates the full response from Gemini before sending it to the client, so the "live typing" effect in the editor is not present; code appears all at once.
-   The `.env` file in this project is not used for the Gemini API key by the server if the client provides one (which it's designed to do).

Enjoy using ZeroCoder!
