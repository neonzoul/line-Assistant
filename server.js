const express = require('express');
const OpenAI = require('openai');
const line = require('@line/bot-sdk');
const axios = require('axios');

// ตั้งค่า API keys และอื่นๆ โดยตรงในโค้ด (ไม่แนะนำสำหรับการใช้งานจริง)
const OPENAI_API_KEY = 'xxxx';
const ASSISTANT_ID = 'xxx';
const LINE_CHANNEL_ACCESS_TOKEN = 'xxxx';
const CHANNEL_SECRET = 'xxx';

const app = express();
app.use(express.json()); // ใช้ middleware เพื่อแปลงข้อมูล request ที่เป็น JSON

// ตั้งค่า LINE SDK config โดยใช้ค่า secret และ access token
const config = {
  channelSecret: CHANNEL_SECRET,
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
};

// สร้าง LINE SDK client
const client = new line.Client(config);

// ตั้งค่า OpenAI SDK โดยใช้ API Key
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ฟังก์ชันสำหรับสร้าง Thread ใน OpenAI
async function createThread() {
  console.log('Creating a new thread...');
  const thread = await openai.beta.threads.create();
  return thread;
}

// ฟังก์ชันสำหรับเพิ่มข้อความไปยัง Thread ใน OpenAI
async function addMessage(threadId, message) {
  console.log('Adding a new message to thread: ' + threadId);
  const response = await openai.beta.threads.messages.create(
    threadId,
    {
      role: "user",
      content: message,
    }
  );
  return response;
}

// ฟังก์ชันสำหรับรัน Assistant ใน OpenAI
async function runAssistant(threadId) {
  console.log('Running assistant for thread: ' + threadId);
  const response = await openai.beta.threads.runs.create(
    threadId,
    {
      assistant_id: ASSISTANT_ID,
    }
  );
  return response;
}

// ฟังก์ชันสำหรับส่งข้อความตอบกลับไปยัง LINE
function replyToLine(replyToken, message) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
  };

  const body = {
    replyToken: replyToken,
    messages: [{
      type: 'text',
      text: message,
    }],
  };

  axios.post('https://api.line.me/v2/bot/message/reply', body, { headers })
    .then(response => {
      console.log('Message sent to LINE:', response.data);
    })
    .catch(error => {
      console.error('Error sending message to LINE:', error.response.data);
    });
}

// รับ Webhook จาก LINE
app.post('/callback', line.middleware(config), async (req, res) => {
  try {
    // เพิ่มการ log headers และ body
    console.log("Received Headers:", req.headers); // แสดง headers ที่ได้รับ
    console.log("Received Body:", req.body); // แสดง body ที่ได้รับ

    const events = req.body.events;
    console.log("Events:", events);

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const replyToken = event.replyToken;

        console.log("User Message:", userMessage);

        const thread = await createThread();
        console.log("Thread ID:", thread.id);

        await addMessage(thread.id, userMessage);
        const run = await runAssistant(thread.id);
        console.log("Run ID:", run.id);

        const checkStatus = setInterval(async () => {
          const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
          console.log("Run Status:", runStatus);

          if (runStatus.status === 'completed') {
            clearInterval(checkStatus);
            const messagesList = await openai.beta.threads.messages.list(thread.id);
            const assistantMessage = messagesList.body.data.map(msg => msg.content).join('\n');
            console.log("Assistant Response:", assistantMessage);

            await client.replyMessage(replyToken, {
              type: 'text',
              text: assistantMessage
            });
          }
        }, 5000);
      }
    }
    res.status(200).end(); 
  } catch (error) {
    console.error("Error:", error);
    res.status(500).end(); 
  }
});

// กำหนด Port สำหรับ Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
