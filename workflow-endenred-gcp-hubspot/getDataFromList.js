const hubspot = require("@hubspot/api-client");
const { google } = require("googleapis");
exports.main = async (event, callback) => {
  let contactsArray = [];
  let contactsToUpdateExcel = [];
  // Leer la lista de contactos
  const contacts = await getContactsFromList();

  if (!contacts) {
    console.error("No se encontraron contactos en la lista.");
    return;
  }

  // Procesar los contactos
  const inputs = contacts.map((contact) => ({ id: contact.recordId }));

  const batchInputs = createBatch(inputs, 40); // Lotes de 40

  if (!batchInputs) {
    return;
  }

  for (const batch of batchInputs) {
    // Obtener los contactos en lotes con sus propiedades.
    let contactsToBeSend = await getBatchContactsFromList(batch);

    if (!contactsToBeSend) {
      console.error("Hubo un error al obtener los contactos.");
      return;
    }
    let contactsTransformed = transformContacts(contactsToBeSend);

    let contactsArrayTemp = contactsTransformed.map((contact) => [
      contact.firstname,
      contact.lastname,
      contact.company,
      contact.email,
      contact.RFC,
      contact.n_mero_de_empleados,
      contact.numero_de_vehiculos,
      contact.phone,
      contact.soluci_n_requerida,
      contact.leadsource,
      contact.suborigen__c,
      contact.white_labe,
      contact.hubspot_owner_id,
    ]);

    let contactsToUpdateExcelTemp = {
      inputs: batch.map((input) => ({
        id: input.id,
        properties: {
          entro_al_excel: true,
        },
      })),
    };

    contactsArray.push(contactsArrayTemp);
    contactsToUpdateExcel.push(contactsToUpdateExcelTemp);
  }

  contactsArray = contactsArray.flat();

  // Enviar los contactos a la hoja de Google Sheets

  if (Array.isArray(contactsArray)) {
    console.log("Se recibieron los contactos correctamente.");
  } else {
    console.error("No se recibieron los contactos correctamente)");
    return;
  }

  const todayString = getToday();

  try {
    // Leer credenciales
    const clientEmail = process.env.GCP_CLIENT_EMAIL;
    const part_1 = process.env.GCP_PRIVATE_KEY_PART_1;
    const part_2 = process.env.GCP_PRIVATE_KEY_PART_2;

    const privateKeyJoined = part_1 + part_2;

    const privateKey = privateKeyJoined.replace(/\\n/g, "\n");

    const spreadsheetId = process.env.SPREADSHEET_ID_TEST;

    // Autenticación con JWT
    const auth = new google.auth.JWT(clientEmail, null, privateKey, [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ]);

    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // Verificar si la hoja ya existe
    const sheetName = todayString;
    const sheetExistsResult = await sheetExists(
      sheetName,
      sheets,
      spreadsheetId
    );

    if (!sheetExistsResult) {
      // Crear una nueva hoja en el archivo de Google Sheets
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                  gridProperties: {
                    rowCount: 100,
                    columnCount: 20,
                  },
                },
              },
            },
          ],
        },
      });

      // Crear los encabezados de la hoja
      const headers = [
        [
          "Nombre",
          "Apellidos",
          "Nombre del prospecto",
          "Correo",
          "RFC",
          "Número de empleados",
          "Número de vehículos",
          "Celular",
          "Soluciones list",
          "Origen del prospecto",
          "Sub-origen",
          "White Labe",
          "Propietario del prospecto",
        ],
      ];

      // Actualizar la hoja con los encabezados
      const rangeForHeaders = `${sheetName}!A1:M1`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: rangeForHeaders,
        valueInputOption: "RAW",
        requestBody: {
          values: headers,
        },
      });

      // Agregar datos de prueba a la hoja

      const appendData = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A1:M1`,
        valueInputOption: "RAW",
        requestBody: { values: contactsArray },
      });

      // Leer la información de la hoja recién creada

      const spreadsheetData = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheet = spreadsheetData.data.sheets.find(
        (s) => s.properties.title === `${sheetName}`
      );

      if (!sheet) {
        throw new Error("No se encontró la hoja 'Sheet1'. Verifica el nombre.");
      }

      const sheetId = sheet.properties.sheetId;

      // Aplicar estilos a los encabezados
      //Formato de texto
      const requestBody = {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers[0].length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 1, green: 0.5, blue: 0.5 },
                  horizontalAlignment: "CENTER",
                  textFormat: {
                    bold: true,
                    fontSize: 12,
                    foregroundColor: { red: 0, green: 0, blue: 0 },
                  },
                },
              },
              fields:
                "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)",
            },
          },
        ],
      };

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody,
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Ajustar automáticamente el ancho de todas las columnas
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetId,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: headers[0].length,
                },
              },
            },
            // Ajustar automáticamente el alto de todas las filas
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: 0,
                  endIndex: contactsArray.length + 1,
                },
              },
            },
          ],
        },
      });

      if (appendData.status === 200) {
        console.log(
          "************ Actualizando contactos en Hubspot ************"
        );
        await updateContactsExcel(contactsToUpdateExcel);
        callback({
          outputFields: {
            contactsToUpdateExcel: contactsToUpdateExcel,
          },
        });
      } else {
        callback({
          outputFields: {
            status: "error",
            message: `Error: ${error.message}`,
          },
        });
      }
    } else {
      try {
        const response = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}`,
          valueInputOption: "RAW",
          requestBody: { values: contactsArray },
        });
        if (response.status === 200) {
          console.log(
            "************ Actualizando contactos en Hubspot ************"
          );
          await updateContactsExcel(contactsToUpdateExcel);
          callback({
            outputFields: {
              contactsToUpdateExcel: contactsToUpdateExcel,
            },
          });
        }
      } catch (error) {
        console.error("Error al agregar los datos a la hoja", error);
        callback({
          outputFields: {
            status: "error",
            message: `Error: ${error.message}`,
          },
        });
      }
    }
  } catch (error) {
    console.error(error);
    callback({
      outputFields: {
        status: "error",
        message: `Error: ${error.message}`,
      },
    });
  }
};

async function getContactsFromList() {
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.API_KEY_HUBSPOT_CLIENT,
  });

  const listId = "8144";
  let after = undefined;
  const before = undefined;
  const limit = 100;

  let contacts = [];

  try {
    let apiResponse = await hubspotClient.crm.lists.membershipsApi.getPage(
      listId,
      after,
      before,
      limit
    );
    contacts = apiResponse.results;

    while (apiResponse.paging && apiResponse.paging.next) {
      apiResponse = await hubspotClient.crm.lists.membershipsApi.getPage(
        listId,
        apiResponse.paging.next.after,
        before,
        limit
      );
      contacts = contacts.concat(apiResponse.results);
    }

    return contacts;
  } catch (e) {
    console.error("Error al obtener contactos desde HubSpot:", e.message);
    if (e.response) {
      console.error(
        "Detalles de la respuesta:",
        JSON.stringify(e.response, null, 2)
      );
    }
  }
}

async function getBatchContactsFromList(inputs) {
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.API_KEY_HUBSPOT_CLIENT,
  });

  const BatchReadInputSimplePublicObjectId = {
    propertiesWithHistory: ["string"],
    inputs: inputs,
    properties: [
      "firstname",
      "lastname",
      "company",
      "email",
      "rfc",
      "n_mero_de_empleados",
      "numero_de_vehiculos",
      "phone",
      "soluci_n_requerida",
      "leadsource",
      "suborigen__c",
      "hubspot_owner_id",
    ],
  };
  const archived = false;

  try {
    const apiResponse = await hubspotClient.crm.contacts.batchApi.read(
      BatchReadInputSimplePublicObjectId,
      archived
    );
    return apiResponse.results;
  } catch (e) {
    e.message === "HTTP request failed"
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e);
  }
}

function generateRFC() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  let rfc = "";

  // Generar 3 letras aleatorias
  for (let i = 0; i < 3; i++) {
    rfc += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Generar 6 números aleatorios
  for (let i = 0; i < 6; i++) {
    rfc += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }

  return rfc;
}

function transformContacts(contacts) {
  return contacts.map((contact) => {
    const props = contact.properties;
    return {
      firstname: props.firstname ?? "",
      lastname: props.lastname ?? "",
      company: props.company ?? "",
      email: props.email ?? "",
      RFC: generateRFC(),
      n_mero_de_empleados: props.n_mero_de_empleados ?? "",
      numero_de_vehiculos: props.numero_de_vehiculos ?? "",
      phone: props.phone ?? "",
      soluci_n_requerida: props.soluci_n_requerida ?? "",
      leadsource: props.leadsource ?? "",
      suborigen__c: props.suborigen__c ?? "",
      white_labe: "",
      hubspot_owner_id: "PENDIENTE",
    };
  });
}

const createBatch = (inputs, batchSize) => {
  const batches = [];
  for (let i = 0; i < inputs.length; i += batchSize) {
    batches.push(inputs.slice(i, i + batchSize));
  }
  return batches;
};

async function updateContactsExcel(inputs) {
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.API_KEY_HUBSPOT_CLIENT,
  });

  for (const batch of inputs) {
    try {
      const apiResponse = await hubspotClient.crm.contacts.batchApi.update(
        batch
      );
      console.log(`Batch actualizado`);
    } catch (e) {
      e.message === "HTTP request failed"
        ? console.error(JSON.stringify(e.response, null, 2))
        : console.error(e);
    }
  }
}

async function sheetExists(sheetName, sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = response.data.sheets.find(
      (s) => s.properties.title === sheetName
    );

    return !!sheet;
  } catch (error) {
    console.error(`Error al buscar la hoja ${sheetName}`, error);
    return false;
  }
}

function getToday() {
  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const month = String(dateNow.getMonth() + 1).padStart(2, "0");
  const day = String(dateNow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
