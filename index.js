require("babel-register");
var Converse = require("./Converse.js"),
    program = require('commander');

program
    .version('1.0')
    .option('-i, --interface [type]', 'What interface will you use for Converse? [server, cli]', 'server')
    .parse(process.argv);

switch(program.interface) {
    case "cli":
        require("./cli").start(Converse);
        break;
    case "server":
        require("./server").start(Converse);
        break;
}
