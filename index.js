const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const chalk = require('chalk');
const figlet = require('figlet');
const chokidar = require('chokidar');

// API Configuration
const BETABOTZ_API = "https://api.betabotz.eu.org/api/search/openai-logic";
const BETABOTZ_API_KEY = "Cynix";

// Bot Configuration
const BOT_NAME = "Lyna";
const LOGIC = `Hai, aku ${BOT_NAME}, asisten virtual lu yang bakal nemenin biar nggak sendirian. Gua orangnya santai, suka bercanda, tapi kalo lu ngomong aneh-aneh atau bikin salah, siap-siap gua ngambek! "Ih, nyebelin banget sih... janji ya nggak gitu lagi?"`;

// Store Session Messages
const sessionMessages = new Map();

// Clean Response Function
const cleanResponse = (response) => {
    return response.replace(/^[a-zA-Z]+:\s*/i, '').trim();
};

// Get AI Response
const getAIResponse = async (text, sessionId) => {
    const previousMessages = sessionMessages.get(sessionId) || "";
    const fullContext = previousMessages + `\nUser: ${text}`;

    try {
        const response = await axios.get(BETABOTZ_API, {
            params: {
                text: fullContext,
                logic: LOGIC,
                apikey: BETABOTZ_API_KEY
            }
        });
        let reply = cleanResponse(response.data.message || "Aku tidak yakin dengan jawaban itu.");
        console.log(chalk.green('API Betabotz berhasil dipanggil.'));
        return reply;
    } catch {
        console.log(chalk.red('API Betabotz gagal dipanggil.'));
        return "Maaf, aku sedang error nih. Coba lagi nanti ya.";
    }
};

// Start Bot Function
const startBot = async () => {
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('./auth_info');

    console.clear();
    console.log(chalk.cyan(figlet.textSync(BOT_NAME, {
        horizontalLayout: 'default'
    })));
    console.log(chalk.green('Memulai bot... Mohon tunggu.\n'));

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    // Connection Events
    sock.ev.on('connection.update', (update) => {
        const {
            connection,
            lastDisconnect,
            qr
        } = update;
        if (qr) {
            console.log(chalk.yellow('Scan QR Code ini untuk menghubungkan bot:'));
            qrcode.generate(qr, {
                small: true
            });
        }
        if (connection === 'open') console.log(chalk.green('Bot berhasil terhubung ke WhatsApp!\n'));
        else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red('Koneksi terputus. Mencoba menghubungkan ulang...'));
            if (shouldReconnect) startBot();
        }
    });
    sock.ev.on('creds.update', saveCreds);

    // Message Event
    sock.ev.on('messages.upsert', async (msg) => {
        const m = msg.messages[0];
        if (!m.message || m.key.fromMe) return;

        const sender = m.key.remoteJid;
        let text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const sessionId = sender;

        console.log(`Pesan diterima: ${text}`);

        // Cek prefix khusus (# atau /) untuk fitur case
        if (text.startsWith('#') || text.startsWith('/')) {
            const command = text.split(' ')[0].slice(1); // Ambil perintah setelah prefix
            const args = text.split(' ').slice(1).join(' '); // Ambil argumen

            try {
                // Berikan status mengetik
                await sock.presenceSubscribe(sender);
                await sock.sendPresenceUpdate('composing', sender);

                switch (command) {
                    case 'ping':
                        await sock.sendMessage(sender, {
                            text: "🏓 *Pong!* Bot sedang aktif dan siap membantu kamu!"
                        }, {
                            quoted: m
                        });
                        break;

                    case 'info':
                        await sock.sendMessage(sender, {
                            text: `👋 Halo! Aku *${BOT_NAME}*, asisten virtual kamu yang siap menemani!\n\n` +
                                `╭─❏ *『 USER INFO 』*\n` +
                                `┣❏ ➤ *📧EMAIL* : 📩 cynix2003s@gmail.com\n` +
                                `┣❏ ➤ *👤USERNAME* : Dani Averige\n` +
                                `┣❏ ➤ *🛠STATUS* : 🧑‍💻 Developer Cynix\n` +
                                `┣❏ ➤ *🌐WEB MAIN* : 🌍 cynix.my.id\n` +
                                `┗⬣ *Semoga harimu menyenangkan!* ✨`
                        }, {
                            quoted: m
                        });
                        break;

                    case 'help':
                        await sock.sendMessage(sender, {
                            text: `🛠 *Daftar Perintah*\n\n` +
                                `✨ *#ping* ➡ Cek status bot.\n` +
                                `✨ *#info* ➡ Informasi tentang bot.\n` +
                                `✨ *#help* ➡ Daftar perintah ini.\n` +
                                `✨ *.<pesan>* ➡ Kirim pertanyaan ke AI.\n\n` +
                                `💡 *Contoh penggunaan:* \n` +
                                `🔹 Ketik: *#ping* atau *.Apa kabar?*\n` +
                                `✨ *Bot akan merespons dengan cepat!*`
                        }, {
                            quoted: m
                        });
                        break;

                    default:
                        await sock.sendMessage(sender, {
                            text: "⚠️ Perintah tidak dikenali! Gunakan *#help* untuk melihat daftar perintah yang tersedia."
                        }, {
                            quoted: m
                        });
                        break;
                }
            } catch (err) {
                console.error(chalk.red('Error di case prefix:'), err.message);
                await sock.sendMessage(sender, {
                    text: "Oops, ada masalah saat memproses perintah."
                }, {
                    quoted: m
                });
            }
            return; // Hentikan eksekusi untuk prefix case
        }

        // Jika prefix adalah `.`, langsung kirim ke AI
        if (text.startsWith('.')) {
            const query = text.slice(1); // Hapus titik di depan

            // Berikan status mengetik
            await sock.presenceSubscribe(sender);
            await sock.sendPresenceUpdate('composing', sender);

            const reply = await getAIResponse(query, sessionId);

            // Simpan konteks
            sessionMessages.set(sessionId, (sessionMessages.get(sessionId) || "") + `\nUser: ${query}\nBot: ${reply}`);

            await sock.sendMessage(sender, {
                text: reply
            }, {
                quoted: m
            });
            return;
        }
    });
};

// Watch File Changes for Live Reload
const watchFileChanges = () => {
    chokidar.watch('./', {
            ignored: /node_modules|auth_info/,
            persistent: true
        })
        .on('change', (path) => {
            console.log(chalk.yellow(`File ${path} diperbarui. Merestart bot...`));
            process.exit(0);
        });
};

// Run the Bot
startBot().catch((err) => console.error(chalk.red('Error bot:'), err));
watchFileChanges();
