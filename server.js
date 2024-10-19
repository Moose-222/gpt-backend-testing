const express = require('express');
const axios = require('axios');
const cors = require('cors');  // Import CORS
const multer = require('multer'); // Import Multer for file uploads
const fs = require('fs'); // Import fs to handle file reading
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Use CORS middleware here
app.use(cors());
app.use(express.json());

// Setup Multer for file uploads, files will be stored in 'uploads/' temporarily
const upload = multer({ dest: 'uploads/' });

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);  // Debugging API key

app.post('/api/chatgpt', upload.single('file'), async (req, res) => {
    console.log('Received request:', req.body);  // Log incoming request body

    const userMessage = req.body.message;
    const file = req.file; // Get the uploaded file

    // Validate the request: either a message or a file must be provided
    if (!userMessage && !file) {
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);
        
        try {
            // Attempt to read file content assuming it is text
            fileContent = fs.readFileSync(file.path, 'utf8');
            console.log('File content:', fileContent);
        } catch (readError) {
            console.error('Error reading file:', readError);
            return res.status(500).json({ error: 'Error reading the file', details: readError.message });
        }
    }

    try {
        // Prepare messages array for OpenAI API
        const messages = [{ role: "user", content: userMessage }];
        
        if (fileContent) {
            // Append file content to the user message if a file exists
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

// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Test route is working!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
