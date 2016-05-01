import socketio from 'socket.io';
const io = new socketio();

module.exports = class Server {
    static start(converse) {
        Server.converse = converse;
        
        io.on('connection', Server.onConnection);
        io.listen(4000);
        
        console.log("Converse server started @ port 4000")
    }
    
    static onConnection (socket) {
        var converse = new Server.converse();
        converse.on("speak", (message) => Server.onSpeak(message, socket))
        converse.on("interact", _ => Server.onInteract(socket))
        converse.on("typing", _ => Server.onTyping(socket))
        socket.on("ask", (message) => Server.onAsk(message, converse))
    }
    
    static onSpeak(reply, connection) {
        connection.emit("speak", { 
            message: reply 
        })
    }
    
    static onAsk(question, converse) {
        converse.ask(question.message);
    }
    
    static onInteract(connection) {
        connection.emit("interact");
    }
    
    static onTyping(connection) {
        connection.emit("typing");
    }
}
