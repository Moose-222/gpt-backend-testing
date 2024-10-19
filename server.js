const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Use CORS middleware here
app.use(cors());
app.use(express.json());

// Setup Multer for file uploads, files will be stored in 'uploads/' temporarily
const upload = multer({ dest: 'uploads/' });

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);

app.post('/api/chatgpt', upload.single('file'), async (req, res) => {
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file);

    const userMessage = req.body.message;
    const file = req.file;

    // Validate that either a message or file must be present
    if (!userMessage && !file) {
        console.log('No message or file received');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);

        try {
            // Read file content assuming it's text for now
            fileContent = fs.readFileSync(file.path, 'utf8');
            console.log('File content:', fileContent);
        } catch (readError) {
            console.error('Error reading file:', readError);
            return res.status(500).json({ error: 'Error reading the file', details: readError.message });
        }
    }

    try {
        // Prepare messages array for OpenAI API
        const messages = [{ role: "user", content: userMessage || "No message provided" }];

        if (fileContent) {
            messages.push({ role: "user", content: `Here is the file content: ${fileContent}` });
        }

        // Call OpenAI API without explicitly setting Content-Type (let FormData handle it)
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: messages,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    // Let the Content-Type be set automatically by axios/multipart handling
                },
            }
        );

        const reply = response.data.choices[0]?.message?.content;
        if (!reply) {
            throw new Error('No valid response received from OpenAI');
        }

        res.json({ reply });
    } catch (error) {
        console.error('Error during OpenAI request:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Something went wrong with the OpenAI request', details: error.message });
    } finally {
        // Cleanup: remove the uploaded file after processing to free up space
        if (file) {
            try {
                fs.unlinkSync(file.path);  // Delete the file from 'uploads' folder
            } catch (unlinkError) {
                console.error('Error deleting the file:', unlinkError);
            }
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
