import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
    const [gitUrl, setGitUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [copySuccess, setCopySuccess] = useState('');
    const [projectUrl, setProjectURL] = useState('');
    const [ws, setWs] = useState(null);
    const [logs, setLogs] = useState([]);

    const logsRef = useRef(null);

    if (!ws) {
        const socket = new WebSocket('ws://localhost:9000');
        socket.onopen = () => {
            console.log('WebSocket established');
        };
        socket.onmessage = (event) => {
            const message = typeof event.data === 'string' ? event.data : '';
            if (message) {
                setLogs(prev => [...prev, JSON.parse(message)["log"]]);
            }
        };
        socket.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
        socket.onclose = () => {
            setStatus((s) => s || 'WebSocket disconnected');
        };
        setWs(socket);
    }

    useEffect(() => {
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [logs]);

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
            setCopySuccess('Failed to copy');
            setTimeout(() => setCopySuccess(''), 2000);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!gitUrl.trim()) return;

        setIsLoading(true);
        setStatus('Creating project...');

        let repositoryUrl = gitUrl.trim();
        if (!repositoryUrl.startsWith('http') && !repositoryUrl.includes('/')) {
            repositoryUrl = `https://github.com/${repositoryUrl}/${repositoryUrl}.github.io`;
        } else if (!repositoryUrl.startsWith('http')) {
            repositoryUrl = `https://github.com/${repositoryUrl}`;
        }

        try {
            const response = await axios.post(`https://api.vercel.harsh-dev.xyz/project`, {
                gitURL: repositoryUrl
            });

            if (response.data.status === 'queued') {
                setStatus('Project queued! Waiting for build to complete...');
                setProjectURL(response.data.data.url);
                const projectId = response.data.data.project_id;
                const wssChannel = response.data.data.wss_channel;

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(wssChannel || `logs:${projectId}`);
                } else if (ws) {
                    ws.addEventListener('open', () => ws.send(wssChannel || `logs:${projectId}`), { once: true });
                }
            }
        } catch (error) {
            console.error('Error creating project:', error);
            setStatus('Error creating project. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="app">
            <div className="header">
                <h1 style={{ color: 'white', fontSize: '25px' }}>Vercel by <a style={{ textDecoration: 'none' }} href="https://x.com/intent/follow?screen_name=harsh_twtt" target='_blank' rel='noopener'>@harsh_twtt</a></h1>
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

            <div className="logs-container" style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "start"
            }}>
                <h3 style={{ margin: 0, }}>Live build logs</h3>
                <div
                    ref={logsRef} // Attach the ref here
                    style={{
                        background: 'var(--glass)',
                        border: '1px solid var(--ring)',
                        padding: '8px',
                        borderRadius: '12px',
                        backdropFilter: 'blur(8px)',
                        marginTop: '10px',
                        width: '100%',
                        height: '200px', // Fixed height to enable scrolling
                        overflowY: 'auto' // Make it scrollable
                    }}
                >
                    {logs.map((log, key) => (
                        <p className='logs' key={key} >{log}</p>
                    ))}
                </div>
            </div>

            {
                projectUrl && (
                    <div className="url-container">
                        <div className="url-display">
                            <span className="url-label">Your project will be at :</span>
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
                                    type='button'
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
                )
            }
        </div >
    )
}

export default App;
