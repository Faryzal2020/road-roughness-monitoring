module.exports = {
    apps: [
        {
            name: "road-roughness-monitor",
            script: "src/index.js",
            interpreter: "bun", // Use Bun as the interpreter
            env: {
                NODE_ENV: "production",
                PORT: 3010
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "1G"
        }
    ]
};
