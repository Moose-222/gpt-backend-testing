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
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // Limit file size to 10MB for testing
});

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);

app.post('/api/chatgpt', upload.single('file'), async (req, res) => {
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file ? req.file.originalname : 'No file uploaded');

    const userMessage = req.body.message;
    const file = req.file;

    // Error handling: if neither a message nor file is provided
    if (!userMessage && !file) {
        console.log('Error: No message or file provided.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        try {
            console.log('File received, processing:', file);
            // Read file content and handle potential errors
            fileContent = fs.readFileSync(file.path, 'utf8');
            console.log('File content successfully read:', fileContent);
        } catch (readError) {
            console.error('Error reading file:', readError);
            return res.status(500).json({ error: 'Error reading the file', details: readError.message });
        }
    }

    try {
        // Prepare messages array for OpenAI API
        const messages = [{ role: "user", content: userMessage }];

        if (fileContent) {
            messages.push({ role: "user", content: `Here is the file content: ${fileContent}` });
        }

        // Make a POST request to the OpenAI API
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
        console.error('Error during OpenAI request:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Something went wrong with the OpenAI request', details: error.message });
    } finally {
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
