const hubspot = require("@hubspot/api-client");

// Constantes y mensajes de error
const DEAL_STAGES = {
  CLOSED_LOST: "1011509895",
  WON_STAGES: {
    CLOSE_WON_GUARDS: "closedlost",
    CLOSE_WON_MODULES: "199064611",
    CLOSE_WON_TRADITIONAL: "199053928",
    CLOSE_WON_MARKING_800: "199055889",
    CLOSE_WON_TELEMARKETING: "199055896",
    CLOSE_WON_DIGITAL: "199055979",
  },
};

const ERROR_MESSAGES = {
  NO_CONTACT: "No se encontró información del contacto",
  NO_ASSOCIATIONS: "El contacto no tiene negocios asociados",
  NO_DEALS: "No se encontraron negocios asociados",
  DEAL_FETCH_ERROR: "Error obteniendo información del negocio",
};

exports.main = async (event, callback) => {
  try {
    const hubspotClient = createHubSpotClient();
    const contactId = event.object.objectId;

    const contact = await fetchContactWithAssociations(
      contactId,
      hubspotClient
    );
    validateContactAssociations(contact);

    const deals = contact.associations.deals.results;
    const dealStages = await fetchAllDealStages(deals, hubspotClient);

    const nonWonDeals = filterNonWonDeals(dealStages);
    const updateResult = await updateDealsToClosedLost(
      nonWonDeals,
      hubspotClient
    );

    handleSuccessResponse(updateResult, callback);
  } catch (error) {
    handleErrorResponse(error, callback);
  }
};

// Helpers principales
const createHubSpotClient = () => {
  return new hubspot.Client({
    accessToken: process.env.HUBSPOT_API_KEY,
  });
};

const fetchContactWithAssociations = async (contactId, client) => {
  try {
    return await client.crm.contacts.basicApi.getById(contactId, null, null, [
      "deals",
    ]);
  } catch (error) {
    throw new Error(ERROR_MESSAGES.NO_CONTACT);
  }
};

const validateContactAssociations = (contact) => {
  if (!contact?.associations?.deals?.results?.length) {
    throw new Error(ERROR_MESSAGES.NO_ASSOCIATIONS);
  }
};

const fetchAllDealStages = async (deals, client) => {
  const dealPromises = deals.map((deal) => fetchDealStage(deal.id, client));
  const dealStages = await Promise.all(dealPromises);

  if (dealStages.some((deal) => !deal)) {
    throw new Error(ERROR_MESSAGES.DEAL_FETCH_ERROR);
  }

  return dealStages;
};

const fetchDealStage = async (dealId, client) => {
  try {
    const deal = await client.crm.deals.basicApi.getById(dealId);
    return {
      dealId: dealId,
      dealName: deal.properties.dealname || "Sin nombre",
      dealStage: deal.properties.dealstage || "Sin etapa",
    };
  } catch (error) {
    return null;
  }
};

const filterNonWonDeals = (dealStages) => {
  const wonStages = Object.values(DEAL_STAGES.WON_STAGES);
  return dealStages.filter((deal) => !wonStages.includes(deal.dealStage));
};

const updateDealsToClosedLost = async (deals, client) => {
  if (!deals.length) throw new Error(ERROR_MESSAGES.NO_DEALS);

  const updateBatch = deals.map((deal) => ({
    id: deal.dealId,
    properties: { dealstage: DEAL_STAGES.CLOSED_LOST },
  }));

  try {
    return await client.crm.deals.batchApi.update({ inputs: updateBatch });
  } catch (error) {
    throw new Error(`Error actualizando negocios: ${error.message}`);
  }
};

// Manejo de respuestas
const handleSuccessResponse = (result, callback) => {
  const updatedDeals = result.results.map((deal) => deal.id).join(", ");
  callback({
    outputFields: {
      success: `Negocios actualizados a "Cierre perdido": ${updatedDeals}`,
    },
  });
};

const handleErrorResponse = (error, callback) => {
  callback({
    outputFields: {
      error: error.message || "Error desconocido en el proceso",
    },
  });
};
