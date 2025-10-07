import dotenv from "dotenv"
dotenv.config()

import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import mime from "mime-types"
import { createClient } from 'redis'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ID = process.env.PROJECT_ID

let publisher
let s3Client

try {
    publisher = createClient({ url: process.env.REDIS_CLIENT })
    await publisher.connect()

    s3Client = new S3Client({ region: 'ap-southeast-2' })
} catch (error) {
    console.error('Failed to initialize clients:', error)
    process.exit(1)
}

const publishLog = async (log) => {
    try {
        await publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
    } catch (error) {
        console.error('Failed to publish log:', error)
    }
}

async function init() {
    console.log('Executing script.js')
    publishLog('Build Started...')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function(data) {
        console.log(data.toString())
        publishLog(data.toString())
    })

    p.on('error', function(data) {
        console.log('Error', data.toString())
        publishLog(`error: ${data.toString()}`)
    })

    p.on('close', async function() {
        console.log('Build Complete')
        publishLog(`Build Complete`)
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        publishLog(`Starting to upload`)
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath)
            publishLog(`uploading ${file}`)

            const command = new PutObjectCommand({
                Bucket: 'vercel-clone-builder',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })

            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('uploaded', filePath)
        }
        publishLog(`Done`)
        console.log('Done...')
    })

    publisher.on("error", (e) => {
        console.log(e);
    })
}

init()
