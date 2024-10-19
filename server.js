const express = require('express');
const axios = require('axios');
const cors = require('cors');  // Import CORS
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());  // Use CORS middleware here
app.use(express.json());

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);  // Debugging API key

app.post('/api/chatgpt', async (req, res) => {
    console.log('Received request:', req.body);  // Log incoming request body

    const userMessage = req.body.message;
    if (!userMessage) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'Test route is working!' });
});
