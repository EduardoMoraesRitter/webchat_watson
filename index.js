app = require('express')();
request = require('request');
http = require('http');
const bodyParser = require('body-parser');

app.enable('trust proxy');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//QUANDO API DE TERCEIRO NAO TEM HTTPS CONFIGURADO CORRETAMENTE, E PRECISA IGNORAR
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

connected = app.listen(8080);
io = require('socket.io').listen(connected);

console.log("SERVIDO LIGADO EM");

app.use(express.static(__dirname + '/public'));

//let messages = [];
connections = [];

router.get('/sdkwebchat',
    (req, res) => {
        if (req.corsOptions.origin == true || true) {
            res.sendFile(__dirname + '/public/javascript.js')
        } else {
            res.status(404);
            res.send();
        }
    })

app.use('/public', express.static(__dirname + '/public'));

router.get('/site', (req, res) => {
    res.sendFile(__dirname + '/public/site.html')
})

router.post('/webchatSendAnswer/', (req, res) => {
    res.send();

    connections.forEach(a => {
        if (a.chatSession == req.body.userID) {
            io.to(a.socketId).emit("receivedMessage", req.body);
        }
    })
}
);


//Conecta no Socket.IO
io.on('connection', socket => {

    console.log("Socket conectado - ", socket.id);

    var cookie = socket.handshake.query['name'];
    if (cookie != undefined) {

        connections.unshift({
            socketId: socket.id,
            chatSession: cookie
        })

    }

    //Quando uma mensagem for enviada pelo cliente
    socket.on('sendMessage', data => {

        //Salvando o chatSession gerado automaticamente para buscar mensagens  antigas. (Apenas enquanto a session estiver ativa no browser)
        data.socketID = socket.id;
        data.serverID = process.env.WEBCHAT_ID

        //Manda para o socket
        socket.emit('receivedMessage', data);


        const objRequest = {
            url: "http://localhost:80/webchat",
            method: 'POST',
            json: true,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: data
        }
        request(objRequest,
            (error, response) => {
                if (error) {
                    console.error("ERRO - callAPIApplication ", error)
                } else if (response.statusCode != 200) {
                    console.warn("warning - callAPIApplication ", response.body)
                } else {
                    console.log("sucesso")
                }
            })
    });

    socket.on('disconnect', data => {
        connections.forEach(function (item, index, object) {
            if (item.socketId === socket.id) {
                object.splice(index, 1);
            }
        });

        console.log(`Socket DESCONECTADO: ${socket.id}, ${io.engine.clientsCount} sockets connected`);
    });

    socket.on('returnPreviousMessages', data => {
        messages_filter = messages.filter(item => item.chatsession == data);
        socket.emit('previousMessages', messages_filter)
    });

});

var watsonConfig = {
    url: "https://gateway-wdc.watsonplatform.net/assistant/api/v1/workspaces/",
    workspace: "d5c3d6f3-4745-4023-a49e-94b6ca65cc6e",
    apikey: "YnD7ZLe86d7IGhJeSv59fAGWMQn_7HEh4zhjf2P8Np2k",
    token: "",
    expirationDate: ""
  }

function detectIntent (req, res) {
    return new Promise(function (resolve, reject) {
        var message = req.objRequest.message
        var user = req.objRequest

        token(watsonConfig)
            .then(function (token) {
                let _body = {
                    input: { text: message },
                    alternate_intents: true
                }
                if (user.context) {
                    _body.context = user.context
                }
                const objRequest = {
                    url: watsonConfig.url + watsonConfig.workspace + '/message?version=2018-09-20&nodes_visited_details=true',
                    method: 'POST',
                    json: true,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Authorization': 'Bearer ' + token
                    },
                    body: _body
                }
                request(objRequest, (error, response) => {
                    if (error) {
                        console.error("ERRO - Watson.prototype.detectIntent", error)
                        reject(error);
                    } else if (response.statusCode != 200 || (response.body.output && response.body.output.error)) {
                        console.warn("warning - Watson.prototype.detectIntent", response.body)
                        reject(response.body);
                    } else {
                        //TODO: voltar aqui
                        var title = response.body.output.nodes_visited_details ? response.body.output.nodes_visited_details[0].title : ""
                        //salva no contexto de para proxima volta
                        response.body.context.from = title
                        resolve({
                            actions: response.body.actions,
                            from: user.context.from ? user.context.from : "",
                            to: title,
                            intent: response.body.intents.length > 0 ? response.body.intents[0].intent : "",
                            entity: response.body.entities.length > 0 ? response.body.entities : "",
                            messages: retorno.output.generic,//FormatTextMessage(response.body),
                            contexts: response.body.context
                        })
                    }
                });
            })
    });
}

function token(watsonConfig) {
    return new Promise(function (resolve, reject) {
        if (watsonConfig.token == "" || watsonConfig.expirationDate == "" || moment().unix() >= watsonConfig.expirationDate) {

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
                    reject(error);
                } else if (response.statusCode != 200) {
                    console.warn("token - ", response.body)
                    reject(response.body);
                } else {
                    watsonConfig.token = response.body.access_token;
                    watsonConfig.expirationDate = response.body.expiration;
                    resolve(watsonConfig.token)
                }
            });

        } else {
            resolve();
        }

    });
};