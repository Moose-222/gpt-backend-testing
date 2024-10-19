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

    const userMessage = req.body.message || ''; // Ensure userMessage is a string even if empty
    const file = req.file;

    // Debugging Logs
    console.log('User Message:', userMessage ? userMessage : '(No message provided)');
    console.log('File:', file ? file.originalname : '(No file uploaded)');

    // Check for both missing message and missing file
    if (!userMessage && !file) {
        console.log('Error: No message or file provided.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);

        try {
            // Read file content assuming it's text for now
            fileContent = fs.readFileSync(file.path, 'utf8');
            console.log('File content read successfully');
        } catch (readError) {
            console.error('Error reading file:', readError);
            return res.status(500).json({ error: 'Error reading the file', details: readError.message });
        }
    }

    try {
        // Prepare messages array for OpenAI API
        const messages = [];

        // Add user message if provided
        if (userMessage.trim()) {
            messages.push({ role: "user", content: userMessage });
        }

        // Add file content if it exists
        if (fileContent) {
            messages.push({ role: "user", content: `Here is the file content: ${fileContent}` });
        }

        // Ensure there's something to send to OpenAI
        if (messages.length === 0) {
            return res.status(400).json({ error: 'No valid input provided for OpenAI request' });
        }

        // Call OpenAI API
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
            console.error('No valid response received from OpenAI');
            return res.status(500).json({ error: 'No valid response received from OpenAI' });
        }

        console.log('OpenAI reply:', reply);
        res.json({ reply });
    } catch (error) {
        // Handle different error cases and print more details to console
        if (error.response) {
            console.error('OpenAI API Error:', error.response.data);
            return res.status(500).json({ error: 'OpenAI API Error', details: error.response.data });
        } else {
            console.error('Request Error:', error.message);
            return res.status(500).json({ error: 'Request failed', details: error.message });
        }
    } finally {
        // Ensure the uploaded file is deleted after processing
        if (file) {
            try {
                fs.unlinkSync(file.path);  // Delete the file from 'uploads' folder
                console.log('File deleted after processing');
            } catch (unlinkError) {
                console.error('Error deleting the file:', unlinkError);
            }
        }
    }
});

// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Test route is working!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
