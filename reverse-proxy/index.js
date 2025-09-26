import dotenv from "dotenv";
dotenv.config()

import express from "express"
import httpProxy from "http-proxy"
import cors from 'cors'

const app = express()
const PORT = process.env.PORT
const BASE_PATH = process.env.S3_URL

const proxy = httpProxy.createProxyServer();

const DYNAMIC_LOCALHOST_REGEX = /^https?:\/\/(.+\.)?localhost:8000/;

const corsConfig = {
    origin: DYNAMIC_LOCALHOST_REGEX,
    credentials: true,
};

app.use(cors(corsConfig));
app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    const resolvesTo = `${BASE_PATH}/${subdomain}`

    return proxy.web(req, res, { target: resolvesTo, changeOrigin: true })
})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'
})

app.listen(PORT, () => console.log(`Reverse Proxy Running on Port ${PORT}`))
