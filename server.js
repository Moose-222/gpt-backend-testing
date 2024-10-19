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
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file);

    const userMessage = req.body.message;
    const file = req.file;

    // Check if there's at least a message or a file
    if (!userMessage && !file) {
        console.log('Error: No message or file received.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);

        try {
            // Read file content assuming it's text
            fileContent = fs.readFileSync(file.path, 'utf8');
            console.log('File content:', fileContent);
        } catch (readError) {
            console.error('Error reading file:', readError);
            return res.status(500).json({ error: 'Error reading the file', details: readError.message });
        }
    }

    try {
        // Prepare the message array
        const messages = [{ role: "user", content: userMessage }];

        if (fileContent) {
            messages.push({ role: "user", content: `Here is the file content: ${fileContent}` });
        }

        // Send request to OpenAI API
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: messages,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const reply = response.data.choices[0]?.message?.content;
        if (!reply) {
            console.error('No valid response from OpenAI.');
            return res.status(500).json({ error: 'No valid response received from OpenAI' });
        }

        res.json({ reply });
    } catch (error) {
        console.error('Error during OpenAI request:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error communicating with OpenAI', details: error.message });
    } finally {
        if (file) {
            try {
                fs.unlinkSync(file.path); // Delete the file
                console.log('File deleted after processing.');
            } catch (unlinkError) {
                console.error('Error deleting the file:', unlinkError);
            }
        }
    }
});
