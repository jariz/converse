import readline from 'readline';
import ora from 'ora';
import clor from "clor"
const typing = ora({text: 'Converse is typing', spinner: "simpleDots"});
const rl = readline.createInterface(process.stdin, process.stdout);

module.exports = class CLI {
    static start(Converse) {
        CLI.converse = new Converse();

        CLI.converse.on("speak", CLI.onSpeak);
        CLI.converse.on("interact", CLI.onInteract);
        CLI.converse.on("typing", CLI.onTyping);

        rl.on("line", CLI.onLine);
        rl.setPrompt(clor.green('You') + ": ");
    }

    static onSpeak(reply) {
        typing.stop();
        console.log(clor.yellow("CONVERSE") + ": " + reply);
    }

    static onInteract() {
        //converse requires interaction to continue
        rl.prompt();
    }

    static onLine(line) {
        CLI.converse.ask(line);
    }

    static onTyping() {
        typing.start();
    }
}