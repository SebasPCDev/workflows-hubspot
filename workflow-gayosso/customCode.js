// customCode.js

const hubspot = require("@hubspot/api-client");

// Función que simula el Custom Code Action de HubSpot
const main = async (event) => {
  const dealWonStageData = {
    closeWonGuards: "closedlost",
    closeWonModules: "199064611",
    closeWonTraditional: "199053928",
    closeWonMarking800: "199055889",
    closeWonTelemarketing: "199055896",
    closeWonDigital: "199055979",
  };

  const hubspotClient = new hubspot.Client({
    accessToken: "YOUR_HUBSP",
  });
  const contact = event.inputFields;
  //Obtener la información del contacto
  const contactInfo = await getContactInfo(contact.id, hubspotClient);

  if (!contactInfo) {
    callback(new Error("No se encontró información del contacto"));
    return;
  }

  if (!contactInfo.associations) {
    callback(new Error("No se encontraron negocios asociados"));
    return;
  }
  const deals = contactInfo.associations.deals.results;

  const dealStageInfo = [];

  for (const deal of deals) {
    const dealInfo = await getDealInfo(deal.id, hubspotClient);
    if (!dealInfo) {
      callback(new Error("No se encontró información del negocio"));
      return;
    }
    dealStageInfo.push({
      dealId: deal.id,
      dealName: dealInfo.properties.dealname || "Sin nombre",
      dealStage: dealInfo.properties.dealstage || "Sin etapa",
    });
  }

  if (dealStageInfo.length === 0) {
    callback(new Error("No se encontraron negocios asociados"));
    return;
  }

  // Obtener los valores de etapas de cierre ganado
  const dealWonStages = Object.values(dealWonStageData);

  // Filtrar los negocios que no estén en las etapas de cierre ganado
  const filteredDeals = dealStageInfo.filter(
    (deal) => !dealWonStages.includes(deal.dealStage)
  );

  console.log(filteredDeals);

  //   const dealsUpdated = await updateLostDeals(filteredDeals, hubspotClient);

  //   const dealsClosedLost = dealsUpdated.results
  //     .map((deal) => deal.id)
  //     .join(", ");

  //   console.log(
  //     `Los siguientes negocios han sido actualizado a "Cierre perdido":${dealsClosedLost}`
  //   );
};

async function getDealInfo(dealId, hubspotClient) {
  const properties = undefined;
  const propertiesWithHistory = undefined;
  const associations = undefined;
  const archived = false;
  try {
    const apiResponse = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      properties,
      propertiesWithHistory,
      associations,
      archived
    );

    return apiResponse;
  } catch (e) {
    callback(e);
  }
}

async function getContactInfo(contactId, hubspotClient) {
  const properties = undefined;
  const propertiesWithHistory = undefined;
  const associations = ["deals"];
  const archived = false;
  try {
    const apiResponse = await hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      properties,
      propertiesWithHistory,
      associations,
      archived
    );

    return apiResponse;
  } catch (e) {
    callback(e);
  }
}

async function updateLostDeals(deals, hubspotClient) {
  const BatchInputSimplePublicObjectBatchInput = deals.map((element) => {
    return {
      id: element.dealId,
      properties: {
        dealstage: "1011509895",
      },
    };
  });

  console.log(BatchInputSimplePublicObjectBatchInput);

  try {
    const apiResponse = await hubspotClient.crm.deals.batchApi.update({
      inputs: BatchInputSimplePublicObjectBatchInput,
    });
    return apiResponse;
  } catch (e) {
    callback(e);
  }
}

function callback(error) {
  console.log({
    outputFields: {
      error: error.message,
    },
  });
}

module.exports = { main };
