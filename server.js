const express = require('express');
const axios = require('axios');
const cors = require('cors');  // Import CORS
const multer = require('multer'); // Import Multer for file uploads
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Use CORS middleware here
app.use(cors());
app.use(express.json());

// Setup Multer for file uploads
const upload = multer({ dest: 'uploads/' }); // Files will be temporarily stored in 'uploads/' folder

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);  // Debugging API key

app.post('/api/chatgpt', upload.single('file'), async (req, res) => {
    console.log('Received request:', req.body);  // Log incoming request body

    const userMessage = req.body.message;
    const file = req.file; // Get the uploaded file

    if (!userMessage && !file) {
        return res.status(400).json({ error: 'Message or file is required' });
    }

    // If there is a file, handle it (for now, we just log the file details)
    if (file) {
        console.log('File received:', file);
        // You can add logic here to process the file, like reading its contents or sending it to an API.
    }

    try {
        // Continue with OpenAI API call
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: userMessage }],
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const reply = response.data.choices[0].message.content;
        res.json({ reply });
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Something went wrong', details: error.message });
    }
});

// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Test route is working!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
