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

// Use /tmp directory for uploads on Vercel (only writeable directory)
const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 10 * 1024 * 1024 } // Set file size limit (10MB in this case)
});

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);

// Handle file upload and message in the request
app.post('/api/chatgpt', (req, res, next) => {
    upload.single('file')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer Error:', err.message);
            return res.status(400).json({ error: err.message });
        } else if (err) {
            console.error('File upload error:', err.message);
            return res.status(500).json({ error: 'File upload error', details: err.message });
        }
        next();
    });
}, async (req, res) => {
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file ? req.file.originalname : 'No file uploaded');

    const userMessage = req.body.message;
    const file = req.file;

    // Check if both message and file are missing
    if (!userMessage && !file) {
        console.log('Error: No message or file provided.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);

        try {
            // Read file content from /tmp
            fileContent = fs.readFileSync(file.path, 'utf8');

            // Truncate file content if it exceeds 1000 characters to prevent token overflow
            if (fileContent.length > 1000) {
                fileContent = fileContent.substring(0, 1000) + '... [truncated]';
            }
            console.log('File content:', fileContent);
        } catch (readError) {
            console.error('Error reading file:', readError);
            return res.status(500).json({ error: 'Error reading the file', details: readError.message });
        }
    }

    try {
        // Prepare messages array for OpenAI API
        const messages = [{ role: "user", content: userMessage || ' ' }]; // Handle empty message scenario

        if (fileContent) {
            messages.push({ role: "user", content: `Here is the file content: ${fileContent}` });
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
        if (error.response) {
            console.error('Error response:', error.response.data);
        } else if (error.request) {
            console.error('Error request:', error.request);
        } else {
            console.error('Error', error.message);
        }
        res.status(500).json({ error: 'Something went wrong with the OpenAI request', details: error.message });
    } finally {
        if (file) {
            try {
                fs.unlinkSync(file.path);  // Delete the file from /tmp directory after processing
                console.log('File deleted after processing');
            } catch (unlinkError) {
                console.error('Error deleting the file:', unlinkError);
            }
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
