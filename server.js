const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Setup Multer for file uploads, files will be stored in 'uploads/' temporarily
const upload = multer({ dest: 'uploads/' });

console.log("OpenAI API Key loaded:", !!process.env.OPENAI_API_KEY); // Check API key is loaded

app.post('/api/chatgpt', upload.single('file'), async (req, res) => {
    console.log('Received request:', req.body);

    const userMessage = req.body.message || null;
    const file = req.file || null;

    // Log the incoming request details
    console.log(`Received message: ${userMessage || 'No message provided'}`);
    if (file) {
        console.log(`Received file: ${file.originalname}`);
    } else {
        console.log('No file uploaded.');
    }

    // Error handling: if neither a message nor file is provided
    if (!userMessage && !file) {
        console.error('400 Bad Request: No message or file provided.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        try {
            // Read file content assuming it's a text file
            fileContent = fs.readFileSync(file.path, 'utf8');
            console.log('File content:', fileContent);
        } catch (err) {
            console.error('Error reading file:', err);
            return res.status(500).json({ error: 'Error reading the file', details: err.message });
        }
    }

    try {
        // Prepare the messages array for the OpenAI API call
        const messages = [];
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
        if (fileContent) {
            messages.push({ role: 'user', content: `File content: ${fileContent}` });
        }

        // Call OpenAI API
        const openaiResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: messages,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const reply = openaiResponse.data.choices[0]?.message?.content;
        if (!reply) {
            console.error('No valid response received from OpenAI.');
            return res.status(500).json({ error: 'No valid response from OpenAI.' });
        }

        // Send back the reply to the client
        res.json({ reply });
    } catch (error) {
        console.error('Error with OpenAI request:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error with OpenAI request', details: error.message });
    } finally {
        if (file) {
            // Clean up uploaded file after processing
            try {
                fs.unlinkSync(file.path);
                console.log('Temporary file deleted.');
            } catch (err) {
                console.error('Error deleting the file:', err);
            }
        }
    }
});
