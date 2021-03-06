import SpeakEasy from "speakeasy-nlp"
import WordPOS from "wordpos"
import EventEmitter from "events"
import Chance from "chance"
import Natural from "natural"
import fetch from "node-fetch"
import gender from "string-gender"
import countryList from "country-list"
import winston from "winston"
import greetings from './data/greetings.json';
import affirmative from './data/affirmative.json'
import negative from './data/negative.json'

const logger = new winston.Logger({
    level: 'debug',
    transports: [new (winston.transports.File)({filename: 'converse.log', json: false})]
});
const wordpos = new WordPOS();
const chance = new Chance();
var countries = countryList();

module.exports = class Converse extends EventEmitter {
    constructor() {
        super();

        // this.stemmer = Natural.LancasterStemmer;
        // this.stemmer.attach();

        this.profile = {
            isMale: undefined,
            likelyCountry: undefined,
            country: undefined,
            name: "",
            music: ""
        };

        this.canInteract = false;
        this.phase = 1;
        this.idk = ["Huh?", "What?", "Come again?", "Not sure how to respond to that. Can you try again?"];

        setTimeout(_ => {
            // make converse say it's opening line
            this.ask("");
        }, 100)
    }

    speak(line, callback) {
        this.emit("typing");

        let wait = chance.integer({min: 150, max: 400});
        for (var i = 0; i < line.length; i++) {
            wait += chance.integer({min: 30, max: 90});
        }

        setTimeout(_ => {
            this.emit("speak", line);
            callback && callback();
        }, wait)
    }

    reply(answer, callback) {
        this.speak(answer, _ => {
            this.emit("interact");
            callback && callback();
        });
    }

    ask(question) {
        const tokenized = wordpos.parse(question), untokenized = tokenized.join(" ").toLowerCase().trim();

        if (!tokenized.length) {
            return;
        }

        switch (this.phase) {
            case 1:
                this.speak(chance.pickone(["Hey!", "Well hello there.", "Look who's nosing around my site!", "Yo, yo"]), _ => {
                    this.reply("What's your name?");
                    this.phase++;
                });
                break;
            case 2:
                //emit fake typing while lookup
                this.emit("typing");
                logger.log("debug", "[profile] Name set to", this.profile);
                gender.getGender({string: untokenized}, (results) => {
                    // var nextQuestion = _ => this.reply("How would you describe yourself?", _ => this.phase += 2);
                    var nextQuestion = _ => {
                        if(this.profile.likelyCountry) {
                            //double check if this is correct
                            let countryName = countries.getName(this.profile.likelyCountry);
                            this.reply("Are you from " + countryName + "?", _ => this.phase++);
                        } else {
                            //ask country
                            this.reply("OK, so where are you from then?", _ => this.phase++);
                        }
                    };

                    var country, greeting = chance.pickone(["Hi", "Hey", "What's up", "Aloha", "Hello"]), pronoun = "";
                    if (results.length > 0) {
                        let result = results[0];
                        logger.log("debug", "country length", result.doc.countries.length, "contents", result.doc.countries)
                        
                        country = result.doc.countries.sort((a, b) => {
                            logger.log("debug", a.name, "A", a.frequency, "B", b.frequency);
                            if (a.frequency < b.frequency) {
                                return 1;
                            }
                            if (a.frequency > b.frequency) {
                                return -1;
                            }
                            // a must be equal to b
                            return 0;
                        })[0];
                        // country = result.doc.countries[0];
                        greetings.forEach(function (item) {
                            if (country.ISO === item.code) {
                                logger.log("debug", "Matched a greeting from origin of this name!", item)
                                greeting = item.greeting;
                            }
                        });

                        logger.log("debug", "determined gender", result.doc.gender);
                        switch (result.doc.gender) {
                            case "?M":
                            case "M":
                            case "1M":
                                pronoun = ", " + chance.pickone(["dude", "bro", "man"]); //todo think of more
                                this.profile.isMale = true;
                                break;
                            case "?F":
                            case "F":
                                pronoun = ", " + chance.pickone(["Miss", "Lady", "girl"]); //todo think of more
                                this.profile.isMale = false;
                                break;
                            default:
                                pronoun = ", " + untokenized;
                                break;
                        }
                    }
                    
                    if(country) {
                        logger.log("debug", "[profile] likelyCountry set to", country.ISO);
                        this.profile.likelyCountry = country.ISO;
                    }

                    this.speak(`${greeting}${pronoun}!`, _ => {
                        if (country) {
                            let countryName = countries.getName(country.ISO);
                            logger.log("debug", "country.ISO =", country.ISO, "aka", countryName);
                            this.speak((greeting !== "Hello" ? "I said that because " : "") + chance.pickone(["I'm guessing you're", "you're probably", "I think you're likely", "it sounds like you're"]) + " from " + countryName + ".", _ => {
                                this.speak("It's so interesting how much you can tell off a person with just a name!", nextQuestion)
                            });
                        } else {
                            this.speak(chance.pickone(["That's a name I hadn't heard of before!", "That's a name you don't hear too often", "People probably tell you that you have a pretty interesting name quite often!"]), nextQuestion);
                        }
                    });
                });

                break;
            case 3:
                //if item not set
                if(this.profile.likelyCountry) {
                    if(affirmative.some(word => untokenized === word)) {
                        //yes
                        this.speak("Cool! I'm great at guessing, huh? &#128539;", _ => {
                            this.reply("If you could describe yourself in a single word, what would it be?", _ => this.phase ++);
                        })
                    } else if(negative.some(word => untokenized === word)) {
                        //no
                        this.profile.likelyCountry = undefined;
                        this.reply("Alright, so where are you from?");
                    } else {
                        //??
                        this.reply(chance.pickone(this.idk))
                    }
                } else {
                    //loop through country list, pick highest rating item
                    let countriesSorted = countries.getNames();
                    let list = [];
                    list.push(...countriesSorted);
                    countriesSorted.sort((a, b) => {
                        var weightA = Natural.JaroWinklerDistance(untokenized, a);
                        var weightB = Natural.JaroWinklerDistance(untokenized, b);

                        if (weightA > weightB) {
                            return -1;
                        }
                        if (weightA < weightB) {
                            return 1;
                        }
                        // a must be equal to b
                        return 0;
                    });

                    //todo make it reject the answer if all words are below a certain score (<0.6?)
                    this.speak(`${countriesSorted[0]} it is!`, _ => {
                        this.reply("So I have another question for you. If you could describe yourself in a single word, what would it be?", _ => this.phase ++);
                    });
                    this.profile.country = countries.getCode(countriesSorted[0]);
                }
                break;
            case 4:
                if (tokenized.length > 0) {
                    var classified = SpeakEasy.classify(question);
                    var word = classified.nouns.length ? classified.nouns[0] : classified.adjectives.length ? classified.adjectives[0] : false;
                    if (word) {
                        logger.log("debug", "nouns", classified.nouns);
                        logger.log("debug", "adjectives", classified.adjectives);
                        wordpos.lookup(word, (definitions) => {
                            //just grab first one lol
                            let definition = definitions[0];
                            logger.log("debug", "definitions", definitions);
                            logger.log("debug", "definition", definition);
                            let synonyms = definition.synonyms.filter((s) => word.toLowerCase() !== s);
                            //pick random synonym
                            if (synonyms.length == 0) {
                                //todo think of something better here........
                                this.reply(chance.pickone(this.idk));
                            } else {
                                let synonym = chance.pickone(synonyms);
                                this.reply("What would you say if I said I thought you were " + synonym + " as well?", _ => this.phase++);
                            }
                        });
                    } else {
                        this.reply(chance.pickone(this.idk))
                    }
                }
                break;
            case 5:
                var result = SpeakEasy.sentiment.analyze(question), sentence;
                if (result.score < 0) {
                    sentence = "Bad judgement call of me then.";
                } else if (result.score > 0) {
                    sentence = "That's great! I figured you thought of it that way.";
                } else {
                    sentence = chance.pickone(["I'm not sure if that's exactly relevant, but OK", "I guess you could see it that way."]);
                }

                this.speak(sentence, _ => {
                    this.reply("What kind of genre of music do you listen to? &#127926;"); //notes emoji
                    this.phase++;
                })
                break;
            case 6:
                var result = SpeakEasy.classify(question);
                
                //emit a fake 'typing' event so we can take the time of the request in account...
                this.emit("typing");

                fetch(`https://api.soundcloud.com/search/sounds?client_id=02gUJC0hH2ct1EGOcYXQIzRFU91c72Ea&filter.genre=${untokenized.toLowerCase()}&limit=1&q=*`)
                    .then((response) => {
                        return response.json();
                    })
                    .then((response) => {
                        if (typeof response.collection == "object" && response.collection.length > 0) {
                            //boast our music knowledge
                            var track = response.collection[0];
                            var title = track.title;
                            if (!title.includes("-")) {
                                title = track.title + track.artist;
                            }

                            this.reply(chance.pickone([
                                "Me too, I've been bumping {track} a lot lately! &#128522;", //blush emoji
                                "Wow, what a coincidence, I've been playing {track} over and over again lately! &#128522;",
                                "We have a lot in common, huh? {track} has been playing over and over again today for me! &#128522;"
                            ]).replace("{track}", `<a target="_blank" href='${track.permalink_url}'>${track.title}</a>`), _ => this.phase++);
                        } else {
                            //bullshit ourselves outta here
                            this.reply("Must be a pretty specific genre! Good for you.", _ => this.phase++);
                        }
                    })
                    .catch(_ => {
                        //bullshit ourselves outta here
                        this.reply("Must be a pretty specific genre! Good for you.", _ => this.phase++);
                    });
                break;
            case 7:
                //todo this callback hell needs to be better >_<
                this.speak("Well, here comes the big reveal:", _ => {
                    this.speak("You were talking to a robot all along! &#129302;", _ => { //robot emoji
                        this.speak("I'm <a target='_blank' href='https://github.com/jariz/converse'>Converse</a>, a AI written by Jari.", _ => {
                            this.speak("If you wish to speak to the real Jari, hit him up with one of the links on the left. &#128521;"); //wink emoji
                        });
                    });
                });
                break;
        }
    }
}