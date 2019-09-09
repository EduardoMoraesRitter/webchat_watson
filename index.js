express = require('express')
app = express()
request = require('request')
http = require('http')
const bodyParser = require('body-parser')

app.enable('trust proxy')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

//QUANDO API DE TERCEIRO NAO TEM HTTPS CONFIGURADO CORRETAMENTE, E PRECISA IGNORAR
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

connected = app.listen(process.env.PORT || 8080)
io = require('socket.io').listen(connected)

console.log("SERVIDO LIGADO EM")

app.get('/sdkwebchat',
    (req, res) => {
        console.log("sdk")
        res.sendFile(__dirname + '/public/script.js')
    })

app.use('', express.static(__dirname + '/public'));

connections = []

//Conecta no Socket.IO
io.on('connection', socket => {

    console.log("Socket conectado - ", socket.id)

    var cookie = socket.handshake.query['name']
    if (cookie != undefined) {
        connections.unshift({
            socketId: socket.id,
            chatSession: cookie
        })
    }

    //Quando uma mensagem for enviada pelo cliente
    socket.on('sendMessage', data => {

        //Salvando o chatSession gerado automaticamente para buscar mensagens  antigas. (Apenas enquanto a session estiver ativa no browser)
        data.socketID = socket.id
        data.serverID = process.env.WEBCHAT_ID

        //Manda para o socket
        socket.emit('receivedMessage', data)

        var message = data.message
        var context = socket.context ? socket.context : ""

        detectIntent(message, context, watsonConfig)
            .then(responseWatson => {
                console.log(responseWatson)
                socket.context = responseWatson.context
                socket.emit("receivedMessage", {
                    messageType:"Text",
                    message:responseWatson.messages[0].text,
                    origin: "bot"
                })
            })
            .catch(err => {
            console.error(err)
            socket.emit("receivedMessage", {
                    messageType:"Text",
                    message:"desculpe erro no servidor",
                    err:err,
                    origin: "bot"
                })
        })
    })

    socket.on('disconnect', data => {
        connections.forEach(function (item, index, object) {
            if (item.socketId === socket.id) {
                object.splice(index, 1)
            }
        })
        console.log(`Socket DESCONECTADO: ${socket.id}, ${io.engine.clientsCount} sockets connected`)
    })

    socket.on('returnPreviousMessages', data => {
        messages_filter = messages.filter(item => item.chatsession == data)
        socket.emit('previousMessages', messages_filter)
    })
})

var watsonConfig = {
    url: "https://gateway-wdc.watsonplatform.net/assistant/api/v1/workspaces/",
    workspace: "ab817e62-7df7-4a3f-967d-5dd84003a3e6",
    apikey: "YnD7ZLe86d7IGhJeSv59fAGWMQn_7HEh4zhjf2P8Np2k",
    token: "",
    expirationDate: ""
}

function detectIntent(message, context, watsonConfig) {
    return new Promise(function (resolve, reject) {
        token(watsonConfig)
            .then(function (token) {
                let _body = {
                    input: { text: message },
                    alternate_intents: true
                }
                if (context) {
                    _body.context = context
                }
                const objRequest = {
                    url: watsonConfig.url + watsonConfig.workspace + '/message?version=2019-02-28&nodes_visited_details=true',
                    method: 'POST',
                    json: true,
                    headers: {
                        'Content-Type': 'application/json', // charset=utf-8',
                        'Authorization': 'Bearer ' + token
                    },
                    body: _body
                }
                request(objRequest, (error, response) => {
                    if (error) {
                        console.error("ERRO - Watson.prototype.detectIntent", error)
                        reject(error)
                    } else if (response.statusCode != 200 || (response.body.output && response.body.output.error)) {
                        console.warn("warning - Watson.prototype.detectIntent", response.body)
                        reject(response.body)
                    } else {
                        //TODO: voltar aqui
                        var title = response.body.output.nodes_visited_details ? response.body.output.nodes_visited_details[0].title : ""
                        //salva no contexto de para proxima volta
                        response.body.context.from = title
                        resolve({
                            actions: response.body.actions,
                            //from: user.context.from ? user.context.from : "",
                            to: title,
                            intent: response.body.intents.length > 0 ? response.body.intents[0].intent : "",
                            entity: response.body.entities.length > 0 ? response.body.entities : "",
                            messages: response.body.output.generic,//FormatTextMessage(response.body),
                            context: response.body.context
                        })
                    }
                })
            })
    })
}

function token(watsonConfig) {
    return new Promise(function (resolve, reject) {
        if (watsonConfig.token == "" || watsonConfig.expirationDate == "" || Date.now().toString().substring(0, 10) >= watsonConfig.expirationDate) {

            const objRequest = {
                url: 'https://iam.bluemix.net/identity/token',
                method: 'POST',
                json: true,
                headers: {
                    "Content-Type": "x-www-form-urlencoded"
                },
                form: {
                    "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                    "apikey": watsonConfig.apikey
                }
            }
            request(objRequest, (error, response) => {
                if (error) {
                    console.error("token - ", error)
                    reject(error)
                } else if (response.statusCode != 200) {
                    console.warn("token - ", response.body)
                    reject(response.body)
                } else {
                    watsonConfig.token = response.body.access_token
                    watsonConfig.expirationDate = response.body.expiration
                    resolve(watsonConfig.token)
                }
            })
        } else {
            resolve(watsonConfig.token)
        }
    })
}
