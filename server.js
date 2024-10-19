const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);  // Temporary for debugging

// ChatGPT API route
app.post('/api/chatgpt', async (req, res) => {
    console.log('Received request:', req.body);  // Log incoming request body

    const userMessage = req.body.message;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!userMessage) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',  // Ensure this is the right endpoint for GPT-3.5 Turbo
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: userMessage }],
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
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

// A test route to check if the server is working
app.get('/api/test', (req, res) => {
    res.json({ message: 'Test route is working!' });
});

// Starting the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
