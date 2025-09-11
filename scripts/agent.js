
const agentInitScript = document.createElement("script");
agentInitScript.type = "module";
agentInitScript.innerHTML = `import Agent from 'https://rispose.com/cdn/v1/sdk.es.js'
const agent = Agents.getOrCreate('ag_usybetbfuygk') ;

document.body.append(agentInitScript);