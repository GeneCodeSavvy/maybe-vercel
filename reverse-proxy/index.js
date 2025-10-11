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

// Using a more flexible regex for CORS origins
const DYNAMIC_DEPLOYMENT_REGEX = "https://api.vercel.harsh-dev.xyz"
const DYNAMIC_LOCALHOST_REGEX = "http://localhost:8000"
app.use(
    cors({
        origin: [DYNAMIC_DEPLOYMENT_REGEX, DYNAMIC_LOCALHOST_REGEX],
        credentials: true,
    })
);

app.use(async (req, res) => {
    try {
        // Because Caddy's `handle_path` strips the prefix, `req.path` will contain the path *after* `/preview`. For example, a request to /preview/folder/page.html results in req.path being '/folder/page.html'.
        let key = req.path;

        // If the path ends with a '/', or is empty, assume it's a directory and append 'index.html'.
        if (key.endsWith('/') || key === '') {
            key += "index.html";
        }

        // Remove the leading slash to form a valid S3 key.
        const s3Key = key.startsWith('/') ? key.substring(1) : key;

        if (!s3Key) {
            return res.status(404).send("Not Found");
        }

        const command = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `__outputs/${s3Key}`,
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
        console.error("Error accessing S3:", error);

        if (error.name === "NoSuchKey") {
            res.status(404).send("Not Found");
        } else {
            res.status(500).send("Internal Server Error");
        }
    }
});

app.listen(PORT, () => {
    console.log(`Reverse Proxy Running on Port ${PORT}`);
});
