const agentInitScript2 = document.createElement("script");
agentInitScript2.type = "module";
agentInitScript2.innerHTML = `
  import Chatbot from "https://solidyne.dx.com.ar/int/embed_soli.js";
  Chatbot.init({
    "n8nChatUrl": "https://n8n.solidyne.dx.com.ar/webhook/e104e40e-6134-4825-a6f0-8a646d882662/chat",
    
    "metadata": {}, // Include any custom data to send with each message to your n8n workflow
    "theme": {
      "button": {
        "backgroundColor": "#51ff2e",
        "right": 20,
        "bottom": 20,
        "size": 50,
        "iconColor": "#373434",
        "customIconSrc": "https://www.svgrepo.com/show/339963/chat-bot.svg",
        "customIconSize": 60,
        "customIconBorderRadius": 15,
        "autoWindowOpen": {
          "autoOpen": false,
          "openDelay": 2
        },
        "borderRadius": "rounded"
      },
      "tooltip": {
        "showTooltip": true,
        "tooltipMessage": "Ask AI 🚀",
        "tooltipBackgroundColor": "#e5ffdb",
        "tooltipTextColor": "#1c1c1c",
        "tooltipFontSize": 15
      },
      "chatWindow": {
        "borderRadiusStyle": "rounded",
        "avatarBorderRadius": 25,
        "messageBorderRadius": 6,
        "showTitle": true,
        "title": "SOLIDYNE AI",
        "titleAvatarSrc": "https://www.svgrepo.com/show/339963/chat-bot.svg",
        "avatarSize": 34,
        "welcomeMessage": "Hola ! puedes consultar y te responderé solo con información de nuestra documentación.\\n\\nHello! You can ask questions and I will respond with information from the documentation. \\n\\n",
        "errorMessage": "El sistema esta temporalmente fuera de servicio!!\\nThe system is temporarily out of service!\\nContact: info@solidynepro.com",
        "backgroundColor": "#ffffff",
        "height": 800,
        "width": 600,
        "fontSize": 16,
        "starterPrompts": [
          "que diferencia tienen las consolas UX18 y UX24?",
          "How do I adjust the sound on my 542 processor?"
        ],
        "starterPromptFontSize": 14,
        "renderHTML": true,
        "clearChatOnReload": false,
        "showScrollbar": true,
        "botMessage": {
          "backgroundColor": "#ebeaea",
          "textColor": "#000000",
          "showAvatar": false,
          "avatarSrc": "https://www.svgrepo.com/show/334455/bot.svg",
          "showCopyToClipboardIcon": false
        },
        "userMessage": {
          "backgroundColor": "#ffece5",
          "textColor": "#050505",
          "showAvatar": true,
          "avatarSrc": "https://www.svgrepo.com/show/532363/user-alt-1.svg"
        },
        "textInput": {
          "placeholder": "Escribe tu consulta / Type your query",
          "backgroundColor": "#ffffff",
          "textColor": "#1e1e1f",
          "sendButtonColor": "#f36539",
          "maxChars": 100,
          "maxCharsWarningMessage": "You exceeded the characters limit. Please input less than 100 characters.\\nTe excediste en la cantidad máxima de 50 caracteres",
          "autoFocus": false,
          "borderRadius": 13,
          "sendButtonBorderRadius": 50
        }
      }
    }
    });
`;
document.body.append(agentInitScript2);