import dotenv from "dotenv"
dotenv.config()

import { createClient } from "redis"
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs"
import { generateSlug } from "random-word-slugs"
import express from "express"
import { WebSocketServer } from "ws"
import { createServer } from "http"
import cors from "cors"

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

const REDIS_CLIENT = process.env.REDIS_CLIENT
const ECS_CLIENT_ACCESS_ID = process.env.ECS_CLIENT_ACCESS_ID
const ECS_CLIENT_SECRET_ACCESS_ID = process.env.ECS_CLIENT_SECRET_ACCESS_ID
const TASK_ARN = process.env.TASK_ARN
const CLUSTER_ARN = process.env.CLUSTER_ARN
const SUB_DOMAIN_URL = process.env.SUB_DOMAIN_URL
const PORT = process.env.PORT || 9000
const SUBNET_ID = process.env.SUBNET_ID.split(',')
const SECURITY_GROUP_ID = process.env.SECURITY_GROUP_ID
const CONTAINER_NAME = process.env.CONTAINER_NAME

const subscriber = createClient({ url: REDIS_CLIENT })
const ecsClient = new ECSClient({
    region: 'ap-southeast-2',
    credentials: {
        accessKeyId: ECS_CLIENT_ACCESS_ID,
        secretAccessKey: ECS_CLIENT_SECRET_ACCESS_ID
    }
})
const config = {
    "TASK": TASK_ARN,
    "CLUSTER": CLUSTER_ARN,
}
const corsOptions = {
    origin: SUB_DOMAIN_URL,
    optionsSuccessStatus: 200
}
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

        const input = {
            cluster: config.CLUSTER,
            taskDefinition: config.TASK,
            launchType: "FARGATE",
            count: 1,
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: SUBNET_ID,
                    securityGroups: [
                        SECURITY_GROUP_ID,
                    ],
                    assignPublicIp: "ENABLED",
                },
            },
            overrides: {
                containerOverrides: [{
                    name: CONTAINER_NAME,
                    environment: [
                        {
                            name: "GIT_REPOSITORY__URL",
                            value: gitURL,
                        },
                        {
                            name: "PROJECT_ID",
                            value: project_id,
                        },
                    ],
                }]
            }
        }

        const command = new RunTaskCommand(input)
        const response = await ecsClient.send(command)

        let status = "queued";

        if (response.failures.length > 0) {
            status = response.failures[0].reason;
            return res.json({ "status": status, "data": {} })
        }

        res.json({
            "status": status,
            "data": {
                project_id,
                url: `http://${project_id}.${SUB_DOMAIN_URL}`,
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
