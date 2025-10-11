import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const app = express();
const PORT = process.env.PORT || 8000;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_REGION = process.env.S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!S3_BUCKET_NAME || !S3_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

const s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
});

// Configure CORS
const DYNAMIC_DEPLOYMENT_REGEX = "https://api.vercel.harsh-dev.xyz"
const DYNAMIC_LOCALHOST_REGEX = "http://localhost:8000"
app.use(
    cors({
        origin: [DYNAMIC_DEPLOYMENT_REGEX, DYNAMIC_LOCALHOST_REGEX],
        credentials: true,
    })
);

// Middleware to set 'trust proxy' if you are behind Caddy/Nginx/Load Balancer.
// This is critical for getting correct IP/Protocol/Host from X-Forwarded-* headers.
app.set('trust proxy', true);

// -------------------------------------------------------------------------
// CORE LOGIC: Dynamic Path Resolution for Nested Deployments
// -------------------------------------------------------------------------

// Regex to capture the project name (the first segment after the initial slash)
// and the resource path (everything after the project name).
// Example: /project-A/static/js/app.js 
// Match 1: project-A
// Match 2: /static/js/app.js
const PROJECT_PATH_REGEX = /^\/([a-zA-Z0-9\-\_]+)(.*)$/;

app.use(async (req, res) => {
    try {
        const path = req.path;
        console.log(`Incoming Path: ${path}`); // Log the full path received from the reverse proxy

        // 1. Check for the project name and the remaining resource path
        const match = path.match(PROJECT_PATH_REGEX);

        if (!match) {
            // Handle the root path (/) or any unrecognised format
            return res.status(404).send("Not Found or Missing Project Name in URL");
        }

        const projectName = match[1]; // e.g., 'average-abundant-australia'
        let resourcePath = match[2];  // e.g., '' or '/static/js/main.js'

        // 2. Determine the full S3 Key based on the resource path
        if (resourcePath === '' || resourcePath === '/') {
            // It's a directory/root request for the project, so fetch index.html
            resourcePath = "/index.html";
        }

        // Remove the leading slash from the resourcePath (e.g., '/index.html' -> 'index.html')
        const finalResourceKey = resourcePath.startsWith('/') ? resourcePath.substring(1) : resourcePath;

        // Construct the full S3 Key
        const s3Key = `__outputs/${projectName}/${finalResourceKey}`;

        console.log(`S3 Key: ${s3Key}`);

        const command = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: s3Key,
        });

        const response = await s3Client.send(command);

        // Set response headers from S3 metadata
        if (response.ContentType) {
            res.setHeader("Content-Type", response.ContentType);
        }
        if (response.CacheControl) {
            res.setHeader("Cache-Control", response.CacheControl);
        }
        if (response.ContentEncoding) {
            res.setHeader("Content-Encoding", response.ContentEncoding);
        }
        if (response.ContentDisposition) {
            res.setHeader("Content-Disposition", response.ContentDisposition);
        }

        // Pipe the S3 object stream to the response
        response.Body.pipe(res);

    } catch (error) {
        console.error("Error accessing S3:", error.name, error);

        if (error.name === "NoSuchKey") {
            // Log for a missing file
            res.status(404).send("Not Found");
        } else {
            // Log for S3 or general server errors
            res.status(500).send("Internal Server Error");
        }
    }
});

app.listen(PORT, () => {
    console.log(`Reverse Proxy Running on Port ${PORT}`);
});
