# Pulsar Edit MCP Server

This is an *early* attempt at making an MCP server to control the [Pulsar](https://github.com/pulsar-edit) editor. The goal is to enable an LLM to assist with software development in Pulsar using a tool like [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) as a chat client.

<img src="https://github.com/user-attachments/assets/e31549e2-e04c-4b67-9b33-90fc20c25d00" width="700" />

## Installation:
```sh
ppm install https://github.com/drunnells/pulsar-edit-mcp-server
```

After the Pulsar package is installed, set the MCP server to lisen in **Packages**->**MCP Server**->**Listen**

You will see a "**MCP:On**" tile in the lower left of the Pulsar editor.

Your LLM MCP Client will need to have the below mcpServers configuration.

## mcpServers JSON:
```json
{
        "mcpServers": {
                "pulsar-edit-mcp-server": {
                        "url": "http://localhost:3000/mcp",
                        "disabled": false,
                        "alwaysAllow": [],
                        "type": "streamable"
                }
        }
}
```

## Supported commands
- **Move Cursor** - Move cursor to a row/column location in the editor.
- **Select Range** - Select a range of text (start row/col, end row/col).
- **Insert Text** - Insert text at the current cursor position.

# Contributing
This project is still in its very early stages. I'm hoping to turn it into something useful one day. If you’re interested in helping shape it, any contribution is welcome and appreciated!
