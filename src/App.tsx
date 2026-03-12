import { useEffect, useRef } from "react";

const WIDTH = 1920;
const HEIGHT = 1080;
const CELL_SIZE = 10; // updated
const COLS = Math.floor(WIDTH / CELL_SIZE);
const ROWS = Math.floor(HEIGHT / CELL_SIZE);

const ALIVE = "#63ff69";
const DEAD = "#002529";
const FADE_TIME = 200; // ms

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS));
    const nextGridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS));
    const ageRef = useRef<Float32Array>(new Float32Array(COLS * ROWS)); // track fade
    const lastSpawnRef = useRef<number>(performance.now());
    const nextSpawnDelayRef = useRef<number>(randomDelay());
    const startTimeRef = useRef<number>(performance.now());

    function randomDelay() {
        return (5 + Math.random() * 2) * 1000;
    }

    function idx(x: number, y: number) {
        // wrap around
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

                // handle fade
                if (alive && !next[i]) {
                    age[i] = FADE_TIME;
                } else if (!alive && age[i] > 0) {
                    age[i] -= delta;
                    if (age[i] < 0) age[i] = 0;
                }
            }
        }

        gridRef.current = next;
        nextGridRef.current = grid;
    }

    function spawnPattern() {
        const patterns = [
            [
                [0, 1, 0],
                [0, 0, 1],
                [1, 1, 1],
            ],
            [
                [0, 1, 1, 1, 1],
                [1, 0, 0, 0, 1],
                [0, 0, 0, 0, 1],
                [1, 0, 0, 1, 0],
            ],
            [
                [1, 0, 1],
                [0, 1, 1],
                [0, 1, 0],
            ],
        ];

        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        const ph = pattern.length;
        const pw = pattern[0].length;
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);

        const grid = gridRef.current;
        const age = ageRef.current;

        for (let py = 0; py < ph; py++) {
            for (let px = 0; px < pw; px++) {
                if (pattern[py][px]) {
                    grid[idx(x + px, y + py)] = 1;
                    age[idx(x + px, y + py)] = 0;
                }
            }
        }
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
                    let alpha = alive ? 1 : fade / FADE_TIME;
                    ctx.fillStyle = `rgba(99,255,105,${alpha})`;
                    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                }
            }
        }
    }

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = WIDTH;
        canvas.height = HEIGHT;

        let lastFrame = performance.now();

        function loop() {
            const now = performance.now();
            const delta = now - lastFrame;
            lastFrame = now;

            // reset every 2 minutes
            if (now - startTimeRef.current > 120_000) {
                gridRef.current.fill(0);
                nextGridRef.current.fill(0);
                ageRef.current.fill(0);
                startTimeRef.current = now;
            }

            if (now - lastSpawnRef.current > nextSpawnDelayRef.current) {
                spawnPattern();
                lastSpawnRef.current = now;
                nextSpawnDelayRef.current = randomDelay();
            }

            step(delta);
            draw(ctx);
        }

        const interval = setInterval(loop, 1000 / 30); // 30 fps

        return () => clearInterval(interval);
    }, []);

    return (
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
    );
}