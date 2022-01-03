const config = require('./../config');

const authenticationController = require('./authentication');
const models_orm = require('./../models/index.model')
const usersController = require('./users')
const sanitize = require('sanitize')();
const { Op } = require('sequelize');
const { Logger } = require('log4js');
const { allowAccountRegistration } = require('./../config');


async function pairDevice(account, qr_string) {
    if (qr_string === undefined || qr_string === null) { return { success: false, badQr: true } }
    // Legacy registrations encode QR data as imei - serial - pairtoken, => 0.8.3 uses only a pairtoken

    var qrCodeParts = qr_string.split("--");
    let deviceQuery;
    let pairJWT;
    if (qrCodeParts.length > 1) {
        deviceQuery = await models_orm.models.device.findOne({ where: { serial: qrCodeParts[1] } });
        pairJWT = qrCodeParts[2];
    } else {
        pairJWT = qr_string;
        const data = await authenticationController.readJWT(qr_string);
        if (data.pair === true) {
            deviceQuery = await models_orm.models.device.findOne({ where: { dongle_id: data.identity } });
        } else {
            return { success: false, noPair: true }
        }

    }


    if (deviceQuery == null) {
        return { success: false, registered: false }
    }

    const device = deviceQuery.dataValues;
    var decoded = await authenticationController.validateJWT(pairJWT, device.public_key);
    if (decoded == null || decoded.pair == undefined) {
        return { success: false, badToken: true }
    }


    if (device.account_id != 0) {
        return { success: false, alreadyPaired: true, dongle_id: device.dongle_id }
    }
    return await pairDeviceToAccountId(device.dongle_id, account.id)

}

async function pairDeviceToAccountId(dongle_id, account_id) {
    const update = await models_orm.models.device.update(
        { account_id: account_id },
        { where: { dongle_id: dongle_id } }
    )


    const check = await models_orm.models.device.findOne({ where: { dongle_id: dongle_id, account_id: account_id } })
    if (check.dataValues) {
        return { success: true, paired: true, dongle_id: dongle_id, account_id: account_id }
    } else {
        return { success: false, paired: false }
    }

}

async function unpairDevice(account, dongleId) {

    const device = await models_orm.models.device.getOne({ where: { account_id: account.id, dongle_id: dongleId } });

    if (device && device.dataValues) {
        await models_orm.models.device.update({ account_id: 0 }, { where: { dongle_id: dongleId } });
        return { success: true }
    } else {
        return { success: false, msg: 'BAD DONGLE', invalidDongle: true };
    }
}

async function setDeviceNickname(account, dongleId, nickname) {
    const device = await models_orm.models.device.getOne({ where: { account_id: account.id, dongle_id: dongleId } });

    const cleanNickname = sanitize.value(nickname, 'string')

    if (device && device.dataValues) {
        await models_orm.models.device.update({ nickname: cleanNickname }, { where: { dongle_id: dongleId } });
        return { success: true, data: { nickname: cleanNickname } }
    } else {
        return { success: false, msg: 'BAD DONGLE', invalidDongle: true };
    }
}

async function getDevices(accountId) {
    const devices = await models_orm.models.device.findAll({where: {account_id: accountId}});
    return devices
}

async function getDeviceFromDongle(dongleId) {
    const devices = await models_orm.models.device.findOne({ where: { dongle_id: dongleId } });

    return devices && devices.hasOwnProperty('dataValues') ? devices.dataValues : null
}

async function setIgnoredUploads(dongleId, isIgnored) {
    const update = models_orm.models.accounts.update(
        { dongle_id: dongleId },
        { where: { uploads_ignored: isIgnored } }
    )

    // TODO check this change was processed..
    return true;

}

async function getAllDevicesFiltered() {
    const devices = await models_orm.models.device.findAll();

    return devices
}


async function updateLastPing(device_id, dongle_id) {
    models_orm.models.device.update({ last_ping: Date.now() }, { where: { [Op.or]: [{ id: device_id }, { dongle_id: dongle_id }] } })
}

async function isUserAuthorised(account_id, dongle_id) {
    if (!account_id || !dongle_id) {return {success: false, msg: 'bad_data'}}
    const account = await usersController.getAccountFromId(account_id);
    if (!account || !account.dataValues) { return { success: false, msg: 'bad_account', data: {authorised: false, account_id: account_id} } }
    const device = await getDeviceFromDongle(dongle_id)

    if (!device) { return { success: false, msg: 'bad_device', data: {authorised: false, dongle_id: dongle_id} } }

    if (device.account_id === account.id) {
        return {success: true, data: {authorised: true, account_id: account.id, dongle_id: device.dongle_id}};
    } else {
        return { success: false, msg: 'not_authorised', data: {authorised: false, account_id: account.id, dongle_id: device.dongle_id} }
    }
}

async function getOwnersFromDongle(dongle_id) {

    const device = await getDeviceFromDongle(dongle_id);

    if (device) {
        return {success: true, data: [device.account_id]};
    } else {
        return {success: false}
    }


}


module.exports = {
    pairDevice: pairDevice,
    unpairDevice: unpairDevice,
    setDeviceNickname: setDeviceNickname,
    getDevices: getDevices,
    getDeviceFromDongle,
    setIgnoredUploads,
    getAllDevicesFiltered,
    pairDeviceToAccountId,
    updateLastPing,
    isUserAuthorised,
    getOwnersFromDongle
}
