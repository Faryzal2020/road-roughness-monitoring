module.exports = {
    apps: [
        {
            name: "road-roughness-monitor",
            script: "src/index.js",
            interpreter: "bun", // Use Bun as the interpreter
            env_file: ".env", // Load environment variables from .env file
            env: {
                NODE_ENV: "production"
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "1G"
        }
    ]
};
