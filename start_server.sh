#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_LOG_FILE="$SCRIPT_DIR/server_runtime.log"

echo "Changing directory to: $SCRIPT_DIR"
cd "$SCRIPT_DIR" || exit 1
echo "Current directory is now: $(pwd)"
echo ""

echo "==============================================================================="
echo "Checking for dependencies (node_modules folder)..."
if [ ! -d "node_modules" ]; then
    echo "\"node_modules\" folder not found."
    echo "Running \"npm install\" to install dependencies. This may take a moment..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: \"npm install\" failed. Please check messages above."
        echo "Exiting."
        exit 1
    fi
    echo "\"npm install\" finished successfully."
else
    echo "\"node_modules\" folder found. Skipping \"npm install\"."
fi
echo "==============================================================================="

echo ""
echo "Attempting to start the ZeroCoder server..."
# You may need to replace this with the actual command
npm start
