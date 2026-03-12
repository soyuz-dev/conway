import { useEffect, useRef, useState } from "react";

const WIDTH = 1920;
const HEIGHT = 1080;
const CELL_SIZE = 10;
const COLS = Math.floor(WIDTH / CELL_SIZE);
const ROWS = Math.floor(HEIGHT / CELL_SIZE);
const DEAD = "#002529";
const FADE_TIME = 200; // ms

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS));
    const nextGridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS));
    const ageRef = useRef<Float32Array>(new Float32Array(COLS * ROWS));

    // Initialize these refs with null, set them in useEffect
    const lastSpawnRef = useRef<number | null>(null);
    const nextSpawnDelayRef = useRef<number>(randomDelay());
    const startTimeRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number | null>(null);

    // State for date and time
    const [dateTime, setDateTime] = useState(new Date());

    // State for battery
    const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
    const [batteryCharging, setBatteryCharging] = useState<boolean | null>(null);
    const [batterySupported, setBatterySupported] = useState(true);

    // State for simulation stats
    const [stats, setStats] = useState({
        population: 0,
        spawns: 0,
        fps: 30,
        generation: 0
    });

    function randomDelay() {
        return (4 + Math.random() * 1.5) * 1000;
    }

    function idx(x: number, y: number) {
        x = (x + COLS) % COLS;
        y = (y + ROWS) % ROWS;
        return y * COLS + x;
    }

    function countNeighbors(grid: Uint8Array, x: number, y: number) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                if (grid[idx(x + dx, y + dy)]) count++;
            }
        }
        return count;
    }

    function step(delta: number) {
        const grid = gridRef.current;
        const next = nextGridRef.current;
        const age = ageRef.current;

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const i = idx(x, y);
                const alive = grid[i];
                const neighbors = countNeighbors(grid, x, y);

                if (alive) {
                    next[i] = neighbors === 2 || neighbors === 3 ? 1 : 0;
                } else {
                    next[i] = neighbors === 3 ? 1 : 0;
                }

                if (alive && !next[i]) {
                    age[i] = FADE_TIME;
                } else if (!alive && age[i] > 0) {
                    age[i] -= delta;
                    if (age[i] < 0) age[i] = 0;
                }
            }
        }

        // Swap references
        gridRef.current = next;
        nextGridRef.current = grid;

        // Update population stat
        const population = next.reduce((acc, val) => acc + val, 0);
        setStats(prev => ({
            ...prev,
            population,
            generation: prev.generation + 1
        }));
    }

    function spawnPattern() {
        const patterns = [
            // Classic glider
            [
                [0, 1, 0],
                [0, 0, 1],
                [1, 1, 1],
            ],
            // LWSS (Lightweight Spaceship)
            [
                [0, 1, 1, 1, 1],
                [1, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [1, 0, 0, 1, 0],
            ],
            // Another small pattern
            [
                [1, 0, 1],
                [0, 1, 1],
                [0, 1, 0],
            ],
        ];

        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        const ph = pattern.length;
        const pw = pattern[0].length;
        const x = Math.floor(Math.random() * (COLS - pw));
        const y = Math.floor(Math.random() * (ROWS - ph));

        const grid = gridRef.current;
        const age = ageRef.current;

        for (let py = 0; py < ph; py++) {
            for (let px = 0; px < pw; px++) {
                if (pattern[py][px]) {
                    const i = idx(x + px, y + py);
                    grid[i] = 1;
                    age[i] = 0; // Reset fade age for newly spawned cells
                }
            }
        }

        setStats(prev => ({ ...prev, spawns: prev.spawns + 1 }));
    }

    function draw(ctx: CanvasRenderingContext2D) {
        const grid = gridRef.current;
        const age = ageRef.current;

        ctx.fillStyle = DEAD;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const i = idx(x, y);
                const alive = grid[i];
                const fade = age[i];

                if (alive || fade > 0) {
                    const alpha = alive ? 1 : Math.min(1, fade / FADE_TIME);
                    ctx.fillStyle = `rgba(99, 255, 105, ${alpha})`;
                    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                }
            }
        }
    }

    // Update date and time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setDateTime(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // Battery API
    useEffect(() => {
        if ('getBattery' in navigator) {
            // @ts-ignore
            navigator.getBattery().then((battery: any) => {
                const updateBattery = () => {
                    setBatteryLevel(battery.level * 100);
                    setBatteryCharging(battery.charging);
                };

                updateBattery();

                battery.addEventListener('levelchange', updateBattery);
                battery.addEventListener('chargingchange', updateBattery);

                return () => {
                    battery.removeEventListener('levelchange', updateBattery);
                    battery.removeEventListener('chargingchange', updateBattery);
                };
            });
        } else {
            setBatterySupported(false);
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = WIDTH;
        canvas.height = HEIGHT;

        // Initialize time refs inside useEffect
        lastSpawnRef.current = performance.now();
        startTimeRef.current = performance.now();
        lastFrameRef.current = performance.now();

        let frameCount = 0;
        let lastFpsUpdate = performance.now();

        const intervalId = setInterval(() => {
            const now = performance.now();

            // Initialize refs if they're null (safety check)
            if (lastFrameRef.current === null) lastFrameRef.current = now;
            if (lastSpawnRef.current === null) lastSpawnRef.current = now;
            if (startTimeRef.current === null) startTimeRef.current = now;

            const delta = now - lastFrameRef.current;
            lastFrameRef.current = now;

            // Calculate FPS
            frameCount++;
            if (now - lastFpsUpdate >= 1000) {
                setStats(prev => ({ ...prev, fps: frameCount }));
                frameCount = 0;
                lastFpsUpdate = now;
            }

            // Reset every 2 minutes
            if (now - startTimeRef.current > 120_000) {
                gridRef.current.fill(0);
                nextGridRef.current.fill(0);
                ageRef.current.fill(0);
                startTimeRef.current = now;
                setStats(prev => ({ ...prev, generation: 0, spawns: 0 }));
            }

            // Check if we should spawn a new pattern
            if (now - lastSpawnRef.current > nextSpawnDelayRef.current) {
                spawnPattern();
                lastSpawnRef.current = now;
                nextSpawnDelayRef.current = randomDelay();
            }

            step(delta);
            draw(ctx);
        }, 1000 / 30); // 30fps

        return () => {
            clearInterval(intervalId);
        };
    }, []); // Empty deps array - runs once on mount

    // Format date and time
    const formattedDate = dateTime.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const formattedTime = dateTime.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Battery indicator component
    const BatteryIndicator = () => {
        if (!batterySupported) {
            return <div style={{ opacity: 0.5 }}>Battery API not supported</div>;
        }

        if (batteryLevel === null) {
            return <div>Loading battery...</div>;
        }

        const level = Math.round(batteryLevel);
        let batteryColor = "#fcacac";
        if (level <= 20) batteryColor = "#ff6b6b";
        else if (level <= 50) batteryColor = "#ffd966";

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{batteryCharging ? "⚡" : "🔋"}</span>
                <div style={{ flex: 1, height: '16px', backgroundColor: 'rgba(252, 172, 172, 0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${level}%`,
                        height: '100%',
                        backgroundColor: batteryColor,
                        transition: 'width 0.3s ease'
                    }} />
                </div>
                <span>{level}%</span>
            </div>
        );
    };

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
            <canvas
                ref={canvasRef}
                style={{
                    position: "fixed",
                    inset: 0,
                    width: "100vw",
                    height: "100vh",
                    display: "block",
                    background: DEAD,
                }}
            />

            {/* Widgets Container - Top Left */}
            <div
                style={{
                    position: "fixed",
                    top: "100px",
                    left: "100px",
                    color: "#fcacac",
                    fontFamily: "Consolas, 'Courier New', monospace",
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    maxWidth: '400px',
                }}
            >
                {/* Date/Time Widget */}
                <div
                    style={{
                        backgroundColor: "rgba(0, 37, 41, 0.7)",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        border: "1px solid #fcacac",
                        backdropFilter: "blur(4px)",
                        letterSpacing: "1px",
                    }}
                >
                    <div style={{ fontSize: "28px", marginBottom: "4px" }}>
                        {formattedTime}
                    </div>
                    <div style={{ fontSize: "16px", opacity: 0.9 }}>
                        {formattedDate}
                    </div>
                </div>

                {/* Battery Status Widget */}
                <div
                    style={{
                        backgroundColor: "rgba(0, 37, 41, 0.7)",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        border: "1px solid #fcacac",
                        backdropFilter: "blur(4px)",
                        fontSize: "16px",
                    }}
                >
                    <div style={{ marginBottom: '8px', opacity: 0.8 }}>⚡ POWER STATUS</div>
                    <BatteryIndicator />
                </div>

                {/* Simulation Stats Widget */}
                <div
                    style={{
                        backgroundColor: "rgba(0, 37, 41, 0.7)",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        border: "1px solid #fcacac",
                        backdropFilter: "blur(4px)",
                        fontSize: "14px",
                    }}
                >
                    <div style={{ marginBottom: '8px', opacity: 0.8 }}>🌀 SIMULATION STATS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        <div>Population:</div>
                        <div style={{ textAlign: 'right', color: '#99ff99' }}>{stats.population.toLocaleString()}</div>

                        <div>Generations:</div>
                        <div style={{ textAlign: 'right', color: '#99ff99' }}>{(stats.generation/1000).toPrecision(2).toLocaleString()}k</div>

                        <div>Total Spawns:</div>
                        <div style={{ textAlign: 'right', color: '#99ff99' }}>{stats.spawns}</div>

                        <div>Grid Size:</div>
                        <div style={{ textAlign: 'right', color: '#99ff99' }}>{COLS}×{ROWS}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}