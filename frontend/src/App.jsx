import { useState } from 'react'
import axios from 'axios'
import './App.css'

function App() {
    const [gitUrl, setGitUrl] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState('')
    const [projectUrl, setProjectUrl] = useState('')
    const [copySuccess, setCopySuccess] = useState('')
    const [logs, setLogs] = useState([])
    const [ws, setWs] = useState(null)

    // Establish WebSocket connection on load
    if (!ws) {
        const socket = new WebSocket('ws://localhost:9000')
        socket.onopen = () => {
            // Connection established
        }
        socket.onmessage = (event) => {
            const message = typeof event.data === 'string' ? event.data : ''
            if (message) {
                setLogs((prev) => [...prev, message])
            }
        }
        socket.onerror = (err) => {
            console.error('WebSocket error:', err)
        }
        socket.onclose = () => {
            setStatus((s) => s || 'WebSocket disconnected')
        }
        setWs(socket)
    }

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopySuccess('Copied!')
            setTimeout(() => setCopySuccess(''), 2000)
        } catch (err) {
            console.error('Failed to copy: ', err)
            setCopySuccess('Failed to copy')
            setTimeout(() => setCopySuccess(''), 2000)
        }
    }

    const checkPageReady = async (url) => {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors' // This allows us to check if the page exists without CORS issues
            })
            return true
        } catch (error) {
            return false
        }
    }


    const pollUntilReady = async (url) => {
        const maxAttempts = 30 // 5 minutes with 10 second intervals
        let attempts = 0

        while (attempts < maxAttempts) {
            setStatus(`Checking if page is ready... (${attempts + 1}/${maxAttempts})`)

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'no-cors'
                })

                // If we get here without an error, the page is ready
                setStatus('Page is ready!')
                setProjectUrl(url)
                return
            } catch (error) {
                // Page not ready yet, continue polling
                attempts++
                await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
            }
        }

        setStatus('Timeout: Page did not become ready in time')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!gitUrl.trim()) return

        setIsLoading(true)
        setStatus('Creating project...')

        // Convert username to proper GitHub repository URL if needed
        let repositoryUrl = gitUrl.trim()
        if (!repositoryUrl.startsWith('http') && !repositoryUrl.includes('/')) {
            // If it's just a username, assume it's a GitHub username and try to find a repo
            repositoryUrl = `https://github.com/${repositoryUrl}/${repositoryUrl}.github.io`
        } else if (!repositoryUrl.startsWith('http')) {
            // If it's username/repo format, add the GitHub URL
            repositoryUrl = `https://github.com/${repositoryUrl}`
        }

        try {
            const response = await axios.post('http://localhost:9000/project', {
                gitURL: repositoryUrl
            })

            if (response.data.status === 'queued') {
                setStatus('Project queued! Waiting for build to complete...')
                const projectUrl = response.data.data.url
                const projectId = response.data.data.project_id
                const wssChannel = response.data.data.wss_channel

                // Subscribe to build logs channel over WebSocket
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(wssChannel || `\u006c\u006f\u0067\u0073:${projectId}`)
                } else if (ws) {
                    ws.addEventListener('open', () => ws.send(wssChannel || `\u006c\u006f\u0067\u0073:${projectId}`), { once: true })
                }

                await pollUntilReady(projectUrl)
            }
        } catch (error) {
            console.error('Error creating project:', error)
            setStatus('Error creating project. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="app">
            <div className="header">
                <h1>Vercel Clone by @harsh_twtt</h1>
            </div>

            <div className="form-container">
                <form onSubmit={handleSubmit} className="form">
                    <input
                        type="text"
                        value={gitUrl}
                        onChange={(e) => setGitUrl(e.target.value)}
                        placeholder="Eg. username/repo or https://github.com/username/repo"
                        className="input"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className="submit-button"
                        disabled={isLoading || !gitUrl.trim()}
                    >
                        →
                    </button>
                </form>
                <p className="instruction">Enter your GitHub repository URL or username/repo</p>
            </div>

            {status && (
                <div className="status">
                    {status}
                </div>
            )}

            {/* Live Build Logs */}
            <div className="logs-container" style={{ marginTop: 16 }}>
                <h3 style={{ margin: 0 }}>Live build logs</h3>
                <pre style={{
                    background: '#0b0b0b',
                    color: '#e5e5e5',
                    padding: 12,
                    borderRadius: 8,
                    maxHeight: 240,
                    overflow: 'auto',
                    fontSize: 12,
                    lineHeight: '18px'
                }}>
{logs.length ? logs.join('\n') : 'No logs yet'}
                </pre>
            </div>

            {projectUrl && (
                <div className="url-container">
                    <div className="url-display">
                        <span className="url-label">Your project is ready at:</span>
                        <div className="url-input-group">
                            <input
                                type="text"
                                value={projectUrl}
                                readOnly
                                className="url-input"
                            />
                            <button
                                onClick={() => copyToClipboard(projectUrl)}
                                className="copy-button"
                            >
                                {copySuccess || 'Copy'}
                            </button>
                        </div>
                        {copySuccess && (
                            <div className="copy-feedback">
                                {copySuccess}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
