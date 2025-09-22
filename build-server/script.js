require('dotenv').config()

import { exec } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
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

    s3Client = new S3Client({
        region: 'ap-southeast-2',
        credentials: {
            accessKeyId: process.env.ECS_CLIENT_ACCESS_ID,
            secretAccessKey: process.env.ECS_CLIENT_SECRET_ACCESS_ID
        }
    })
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

const uploadFileToS3 = async (filePath, s3Key) => {
    try {
        const fileContent = await fs.readFile(filePath)
        const contentType = mime.lookup(filePath) || 'application/octet-stream'

        const command = new PutObjectCommand({
            Bucket: 'vercel-clone-outputs',
            Key: s3Key,
            Body: fileContent,
            ContentType: contentType
        })

        await s3Client.send(command)
        await publishLog(`Uploaded: ${s3Key}`)
    } catch (error) {
        await publishLog(`Failed to upload ${filePath}: ${error.message}`)
        throw error
    }
}

const getAllFiles = async (dirPath, arrayOfFiles = []) => {
    try {
        const files = await fs.readdir(dirPath)

        for (const file of files) {
            const fullPath = path.join(dirPath, file)
            const stat = await fs.stat(fullPath)

            if (stat.isDirectory()) {
                await getAllFiles(fullPath, arrayOfFiles)
            } else {
                arrayOfFiles.push(fullPath)
            }
        }

        return arrayOfFiles
    } catch (error) {
        await publishLog(`Error reading directory ${dirPath}: ${error.message}`)
        throw error
    }
}

const buildProject = async (outputPath) => {
    return new Promise((resolve, reject) => {
        const buildProcess = exec(`cd ${outputPath} && npm install && npm run build`)

        buildProcess.stdout?.on('data', async (chunk) => {
            await publishLog(chunk.toString().trim())
        })

        buildProcess.stderr?.on('data', async (chunk) => {
            await publishLog(`Error: ${chunk.toString().trim()}`)
        })

        buildProcess.on('close', (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Build process exited with code ${code}`))
            }
        })

        buildProcess.on('error', (error) => {
            reject(error)
        })
    })
}

async function init() {
    try {
        await publishLog("Clone Complete")
        await publishLog("Starting Build")

        const outputPath = path.join(__dirname, 'output')

        try {
            await fs.access(outputPath)
        } catch {
            throw new Error(`Output directory does not exist: ${outputPath}`)
        }

        await buildProject(outputPath)
        await publishLog('Build Complete')

        const distPath = path.join(outputPath, 'dist')

        try {
            await fs.access(distPath)
        } catch {
            throw new Error(`Dist directory does not exist: ${distPath}`)
        }

        const allFiles = await getAllFiles(distPath)
        await publishLog(`Found ${allFiles.length} files to upload`)

        const uploadPromises = allFiles.map(async (filePath) => {
            const relativePath = path.relative(distPath, filePath)
            const s3Key = `__outputs/${PROJECT_ID}/${relativePath.replace(/\\/g, '/')}`
            return uploadFileToS3(filePath, s3Key)
        })

        const batchSize = 10
        for (let i = 0; i < uploadPromises.length; i += batchSize) {
            const batch = uploadPromises.slice(i, i + batchSize)
            try {
                await Promise.all(batch)
            } catch (error) {
                await publishLog(`Batch upload failed: ${error.message}`)
            }
        }

        await publishLog("Project is ready")

    } catch (error) {
        await publishLog(`Build failed: ${error.message}`)
        console.error('Build process failed:', error)
        throw error
    } finally {
        try {
            await publisher.quit()
        } catch (error) {
            console.error('Failed to close Redis connection:', error)
        }
    }
}

process.on('unhandledRejection', async (reason, promise) => {
    await publishLog(`Unhandled Rejection: ${reason}`)
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    process.exit(1)
})

process.on('uncaughtException', async (error) => {
    await publishLog(`Uncaught Exception: ${error.message}`)
    console.error('Uncaught Exception:', error)
    process.exit(1)
})

init().catch(async (error) => {
    await publishLog(`Fatal error: ${error.message}`)
    console.error('Fatal error:', error)
    process.exit(1)
})
