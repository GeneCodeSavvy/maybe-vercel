import dotenv from "dotenv"
dotenv.config()

import { createClient } from "redis"
import child_process from "child_process"
import { generateSlug } from "random-word-slugs"
import express from "express"
import { WebSocketServer } from "ws"
import { createServer } from "http"
import cors from "cors"


const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })
const subscriber = createClient({ url: process.env.REDIS_CLIENT })
const ecsClient = new ECSClient({
    region: 'ap-southeast-2',
    credentials: {
        accessKeyId: process.env.ECS_CLIENT_ACCESS_ID,
        secretAccessKey: process.env.ECS_CLIENT_SECRET_ACCESS_ID
    }
})
const config = {
    "TASK": process.env.TASK_ARN,
    "CLUSTER": process.env.CLUSTER_ARN,
}
const corsOptions = {
    origin: process.env.SUB_DOMAIN_URL,
    optionsSuccessStatus: 200
}
const PORT = process.env.PORT || 9000
const redisChannels = new Map()


app.use(express.json())
app.use(cors(corsOptions))

app.post('/project', async (req, res) => {
    try {
        const { gitURL } = req.body;

        if (!gitURL) {
            return res.status(400).json({ error: "gitURL is required" });
        }

        const project_id = generateSlug()

        const command = `docker run -v /var/run/docker.sock:/var/run/docker.sock -e GIT_REPO__URL=${gitURL} -e PROJECT_ID=${project_id} vercel-clone-builder`

        const p = child_process.exec(command)
        p.on("message", (message) => {
            console.log(message)
        })
        p.on("error", (err) => {
            console.log(err)
        })

        let status = "queued";

        res.json({
            "status": status,
            "data": {
                project_id,
                url: `http://${project_id}.${process.env.SUB_DOMAIN_URL}`,
                wss_channel: `logs:${project_id}`
            }
        })
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: "Failed to create project" });
    }
})

const init = async () => {
    try {
        await subscriber.connect()
        console.log('Connected to Redis');

        wss.on('connection', (socket) => {
            console.log('New WebSocket connection')

            socket.on('message', async (data) => {
                try {
                    const channel = data.toString();
                    console.log(`Subscribing to channel: ${channel}`);

                    if (redisChannels.has(socket)) {
                        return socket.send(JSON.stringify({ error: "Channel already in use" }));
                    }

                    redisChannels.set(socket, channel);

                    await subscriber.subscribe(channel, (message) => {
                        if (socket.readyState === socket.OPEN) {
                            socket.send(message);
                        }
                    });
                } catch (error) {
                    console.error('Subscription error:', error);
                    socket.send(JSON.stringify({ error: 'Failed to subscribe', details: error.message }));
                }
            })

            socket.on('close', async () => {
                try {
                    const channel = redisChannels.get(socket);
                    if (channel) {
                        await subscriber.unsubscribe(channel);
                        redisChannels.delete(socket);
                        console.log(`Unsubscribed from channel: ${channel}`);
                    }
                    console.log('WebSocket connection closed')
                } catch (error) {
                    console.error('Error during socket close:', error);
                }
            })

            socket.on('error', (error) => {
                console.error('WebSocket error:', error);
            })
        })
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

init()

server.listen(PORT, () => {
    console.log(`HTTP server and WebSocket server listening on port: ${PORT}`)
})
