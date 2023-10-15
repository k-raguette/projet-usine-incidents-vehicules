

// const PDFdocument = require('pdfkit');
const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const express = require('express');
//Instanciation du serveur
const server = express();
server.use(express.json());
server.use(express.urlencoded());

const sqlite3 = require('sqlite3').verbose();

// Lire le contenu du fichier HTML
const htmlContent = fs.readFileSync('index.html', 'utf-8');

//Configuration des routes
server.get('/', (req, res) => {
  res.sendFile(__dirname + '/interface3.html');
});

server.use(express.static(__dirname)); // Cela permettra de servir les fichiers statiques (comme les fichiers CSS).

server.get('/vehicules', (req, res) => {
    // Connexion à la base de donnée SQlite
    const db = new sqlite3.Database('./data/productionDB.sqlite', err => {
    if (err) {
      return console.error(err.message);
    }
    console.log("Connexion réussie à la base de données");
  });
    db.all('SELECT vehicule_id, vehicule_desc FROM vehicule', (err,rows) => {
        if(err){
            res.status(500).json({ error: err.message });
            return;
        }   
            console.log(rows);
            res.json(rows);
    });
    db.close();
});

server.post('/submit', async function (req, res) {
    const db = new sqlite3.Database('./data/productionDB.sqlite');
    const vehicule = req.body.vehicule;
    const poste = req.body.poste; //non utilisé
    const ordre = req.body.ordre; //non utilisé
    const $ = cheerio.load(htmlContent);
    console.log(vehicule, poste, ordre);
    res.send('Formulaire soumis avec succès');

    //utilisé 3 foissur la partie fixe - Description du véhicule
    await new Promise((resolve, reject) => {
        db.all('SELECT vehicule_desc FROM vehicule WHERE vehicule_id=' + vehicule, (err, rows) => {
            if (err) {
                console.error(err.message);
                reject(err);
            } else {
                console.log('Description du véhicule: ', rows[0].vehicule_desc);
                const vehicule_desc1 = $('#vehicule_desc1');
                const vehicule_desc2 = $('#vehicule_desc2');
                const vehicule_desc3 = $('#vehicule_desc3');
                vehicule_desc1.text(rows[0].vehicule_desc);
                vehicule_desc2.text(rows[0].vehicule_desc);
                vehicule_desc3.text(rows[0].vehicule_desc);
                resolve();
            }
        });
    });

    //utilisé 1 fois - Nombre  d'incidents sur le véhicule
    await new Promise((resolve, reject) => {
        db.all('SELECT COUNT(i.ordre) as NB FROM incident i INNER JOIN ordre o ON i.ordre = o.ordre_id INNER JOIN vehicule v ON o.vehicule=v.vehicule_id WHERE v.vehicule_id= ' + vehicule, (err, rows) => {
            if (err) {
                console.error(err.message);
                reject(err);
            } else {
                console.log("Le nombre d'incidents déclarés sur le véhicule " + vehicule + ": " + rows[0].NB);
                const NBi = $('#NBi');
                NBi.text(rows[0].NB);
                resolve();
            }
        });
    });

    //tableau des incidents
    await new Promise((resolve, reject) => {

        db.all('SELECT i.incident_id, i.incident_desc, i.etat FROM incident i INNER JOIN ordre o ON i.ordre = o.ordre_id INNER JOIN vehicule v ON o.vehicule=v.vehicule_id WHERE v.vehicule_id= '+ vehicule, (err, rows) => {
            if (err){
                console.error(err.message);
                reject(err);
            }else{
                //si resultat sinon message aucun incident
                let incident_div = $('#incident_div');
                if (rows.length > 0){
                    incident_div.append("<table id='incident_table'><tr id='header'><th style='width: 33%;'>ID</th><th style='width: 33%;'>Description de l'incident</th><th style='width: 33%;'>État</th></tr></table>");
                    for (i=0; i<rows.length;i++){
                        let incidents = [];
                        let data_incident = [];
                        data_incident.push(rows[i].incident_id, rows[i].incident_desc, rows[i].etat);
                        incidents.push(data_incident);
                        let incident_table = $('#incident_table');
                        incidents.forEach(liste => {
                            if (rows[i].etat == 'OPEN'){
                                text_content = '<tr><td>' + liste[0] + '</td><td>' + liste[1] + '</td><td style="background-color: green;">' + liste[2] + '</td></tr>';
                                incident_table.append(text_content);
                            }else{
                                text_content = '<tr><td>' + liste[0] + '</td><td>' + liste[1] + '</td><td style="background-color: red;">' + liste[2] + '</td></tr>';
                                incident_table.append(text_content);
                            }
                        });
                    };
                }else{
                    //ajouter un p "Aucun incident détecté sur le véhicule"
                    incident_div.append("<br><strong><p>Aucun incident n'a été détecté sur le véhicule.</p></strong>")
                }
                resolve();
            }
        });
    });

    //------------------------------------------------------------------------------------------------------------------------------------------------ 

    //Ici on veut la liste des postes ayant travaillé sur un véhicule 
    const postes_par_vehicule = await new Promise((resolve, reject) => {
        db.all('SELECT DISTINCT o.poste, p.poste_desc FROM ordre o INNER JOIN poste p ON o.poste = p.poste_id WHERE o.vehicule = ' + vehicule, (err, rows)=>{
            if (err){
                console.log(err.message);
                reject(err);
            }else{
                const postes = rows.map(row => row.poste);
                const postes_desc = rows.map(row=>row.poste_desc);
                const poste_desc1 = $('#poste_desc1');
                let text_to_append = '';
                for (const item of postes_desc){
                    text_to_append = text_to_append + item + ' | ';
                }
                poste_desc1.text(text_to_append);
                resolve(postes);
                }
            });
        });

    
    console.log("liste des postes pour le véhicule: ", postes_par_vehicule);
    //pour chaque poste ayant travaillé sur le véhicule
    for (const posteV of postes_par_vehicule) {
        const incidentsData = await new Promise((resolve, reject) => {
                    //on récupère l'id incident et l'id ordre de travail s'ils existent et que l'ordre de travail concerne un incident
                    db.all('SELECT o.poste, i.incident_id, o.ordre_id, v.vehicule_desc, p.poste_desc FROM incident i INNER JOIN ordre o ON i.ordre=o.ordre_id INNER JOIN vehicule v ON o.vehicule=v.vehicule_id INNER JOIN poste p ON o.poste=p.poste_id WHERE o.poste=' + posteV + ' AND o.vehicule =' + vehicule, (err, rows) => {
                        if (err) {
                            console.log(err.message);
                            reject(err);
                        } else {
                            //si on a un résultat de la base avec le poste étudié, on alimente la section poste avec un h3, p et une table 
                            if (rows.length > 0){
                                let section_poste = $('#section_poste');
                                let h3 = '<h3 style="color: rgb(5, 118, 240);">Poste de travail : <strong class="poste_desc'+posteV+'"></strong></h3>'
                                section_poste.append(h3);
                                let p = '<p>Le tableau ci-dessous montre la liste des incidents déclarés sur le poste de travail <strong class="poste_desc'+posteV+'">poste_desc</strong> pour le véhicule <strong id="vehicule_desc'+vehicule+'"></strong>:</p>'
                                section_poste.append(p);
                                let vehicule_desc = $('#vehicule_desc'+vehicule);
                                vehicule_desc.text(rows[0].vehicule_desc);
                                let poste_desc = $('strong.poste_desc'+posteV);
                                poste_desc.text(rows[0].poste_desc);
                                let tb = '<div id="tables'+posteV+'"></div>'
                                section_poste.append(tb);
                                let poste_tables = $('#tables'+posteV);
                                let text_table_template = '<table id="tableToAppend'+posteV+'"><tr><th style="width: 50%;">ID</th><th style="width: 50%;">OT</th></tr></table><br>';
                                poste_tables.append(text_table_template);
                                console.log('ca passe ici avec le poste: '+posteV, rows);
                                for (i=0;i<rows.length;i++){
                                    console.log('Résultats des incidents pour le poste concernés: ' + rows[i].incident_id + ' et ' + rows[i].ordre_id+ ' et ' + rows[i].vehicule_desc+ ' et ' + rows[i].poste_desc);
                                    let tableToAppend = $('#tableToAppend'+posteV);
                                    text_row = '<tr><td>' +rows[i].incident_id+ '</td><td>'+rows[i].ordre_id+ '</td></tr>';
                                    tableToAppend.append(text_row);
                                }
                                
                            };
                            resolve();
                        }
                    });
        });
    }
    
    
    (async () => {
        const updatedHtml = $.html();
        fs.writeFileSync('cheer.html', updatedHtml);
        const timestamp = Date.now();
        console.log(timestamp);
        const pdfFileName = `Rapport_vehicule_${timestamp}.pdf`
        // const pdfFileName = `Rapport_vehicule.pdf`
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Définissez la page de destination (URL ou fichier HTML local)
        const fileUrl = 'file://' + __dirname + '/cheer.html'; // Utilisez __dirname pour obtenir le chemin absolu

        // Accédez à la page HTML
        await page.goto(fileUrl, { waitUntil: 'networkidle0' });

        await page.evaluate(() => { const contenu = document.getElementById("pdf");

        // Fonction pour retrouver la page exacte où se trouve les titres du sommaire
        function findPageNumber(htmlFileContent, searchString) {
            const pageBreaks = htmlFileContent.split('<div class="page-break"></div>');
            let regex; 
        
            if (searchString.includes("Liste des incidents")) {
                regex = /Liste des incidents(?! du véhicule)/;
            } else if (searchString.includes("Poste de travail")) {
                regex = /Poste de travail : (.*?)(?= -|$)/;
            } else {
                regex = new RegExp(searchString);
            }
        
            let currentPage = 1;
            for (let i = 0; i < pageBreaks.length; i++) {
                if (regex.test(pageBreaks[i])) {
                    break;
                }
                currentPage++;
            }
        
            return currentPage;
        }

        // Fonction pour ajouter des points aux titres du sommaire

        const maxLength = 200;
        function addDotsToMaxLength(inputString, maxLength) {
            const difference = maxLength - inputString.length;
            if (difference > 0) {
                const dots = '.'.repeat(difference);
                return inputString + dots;
            } else {
                return inputString;
            }
        }

        //Ajout du sommaire à l'emplacement dédié en ajoutant le numéro de page et les pointillés aux titres

        // Sélectionnez la liste de la table des matières
        const tableDesMatières = document.getElementById("tableDesMatières");
                      
        // Parcourez les titres de section (h2 et h3) dans la zone de contenu
        const titresSections = document.querySelectorAll("h2, h3");
        
        // Variable avec le contenu de la page HTML nécessaire pour appeler la fonction findPageNumber()
        const pageContent = document.documentElement.outerHTML;
        

        // Créez des liens pour chaque titre de section dans la table des matières
        titresSections.forEach(function(titreSection, index) {
            const lien = document.createElement("a");
            const originalText = titreSection.textContent;
            const modifiedText = originalText.padEnd(maxLength, '.'); 
            console.log("Le nombre de caractères est : " + modifiedText.length);
            const position = findPageNumber(pageContent, originalText);
            lien.textContent = modifiedText + position;
            lien.href = "#section-" + (index + 1);
            const p = document.createElement("p");
            p.appendChild(lien);
            tableDesMatières.appendChild(p);
            // Ajoutez un identifiant unique à la section

            titreSection.id = "section-" + (index + 1);
             });
 
        });
          
        // Générez un PDF à partir de la page HTML
        await page.pdf({ path:'./output/' + pdfFileName,     displayHeaderFooter: true,
        headerTemplate: '<span></span>', // Ajouter un en-tête vide
        footerTemplate: '<div style="position: fixed;right: 0; font-size: 15px;margin-right: 20px;"><span class="pageNumber"></span></div>', // Ajouter un pied de page avec numéro de page
        margin: { top: 70, bottom: 70 },
        format: 'A4', printBackground: true,
       });

        await browser.close();

        fs.unlinkSync('./cheer.html');

        console.log('Conversion en PDF terminée.');
        })();

    db.close();
});

//Launch server
server.listen(3000, function() {
    console.log('Serveur en écoute');
});