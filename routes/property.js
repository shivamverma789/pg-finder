const express = require('express');
const {isLoggedIn, isRoleProvider, isRoleAdminOrProvider, isRoleRider} = require("../middlewares/role_validator");
const {validatePropertyDetails} = require('../middlewares/schema_validator');
const router = express.Router();
const providers = require('../models/provider');
const properties = require('../models/property');
const riders = require('../models/rider');

router.get('/', async (req, res) => {
	let {
		searchType, // determining what type of search it is. values: ['zip', 'text']
		searchText, // text entered for searching
		gender, // what gender are we looking for
		rating, // what is the minimum rating
		rate, // what is the maximum rate
		skip, // how many results to skip
		resCount // how many results to return
	} = req.query;

	gender = !gender ? 'co' : gender;
	rating = !rating ? 0 : Number(rating);
	rate = !rate ? Number.MAX_SAFE_INTEGER : Number(rate);

	let result;
	if (searchType === 'zip')
		result = await properties.find({
			zip: searchText, $and: [{type: gender}, {rating: {$gte: rating}}, {rate: {$lte: rate}}]
		}).sort({'name': 1}).skip(skip).limit(resCount);

	else
		result = await properties.find({
			$text: {$search: searchText}, $and: [{type: gender}, {rating: {$gte: rating}}, {rate: {$lte: rate}}]
		}, {
			score: {$meta: "textScore"}
		}).sort({score:{$meta:"textScore"}}).skip(skip).limit(resCount);

	let isFirst = false;
	if (skip === 0)
		isFirst = true;

	let isLast = false;
	if (result.length < resCount)
		isLast = true;

	return res.send({
		results: result,
		isFirst: isFirst,
		isLast: isLast
	});
});

router.get('/new', isLoggedIn, isRoleProvider, (req, res) => {
	res.send('new Property page!');
});

router.post('/', isLoggedIn, isRoleProvider, validatePropertyDetails, async (req, res) => {
	const {
		name, addBuilding, addL1, addL2, landmark, state, city, zipCode, maxOccupancy, type, desc, food, foodText,
		amenities, amenitiesText, rules, otherCharges, otherChargesText, occupancy, rate, tagLine, since, bookingMoney
	} = req.body;

	const address = { addBuilding, addL1, addL2, landmark, state, city, zipCode, country: 'India' };
	const foodProp = [];
	food.forEach((v, idx) => {
		foodProp.push({ name: v, detail: foodText[idx], path: `images/svg/${v}`});
	});

	const amenityProp = [];
	amenities.forEach((v, idx) => {
		amenityProp.push({ name: v, detail: amenitiesText[idx], path: `images/svg/${v}`});
	});

	const allRules = ['visitor-entry', 'non-veg-food', 'opposite-gender', 'smoking', 'drinking', 'loud-music', 'party'];
	const rulesProp = [];
	allRules.forEach((v) => {
		rulesProp.push({ name: v, allowed: rules.includes(v), path: `images/svg/${v}`});
	});

	const otherChargesProp = [];
	otherCharges.forEach((v, idx) => {
		otherChargesProp.push({name: v, detail: otherChargesText[idx], path: `images/svg/${v}`})
	});

	const userRoleID = req.session.userRoleID;
	const owner = providers.findById({id: userRoleID});

	const propertyCreated = await properties.create({
		name, address: address, maxOccupancy, type, desc, food: foodProp, amenities: amenityProp, rules: rulesProp,
		otherCharges: otherChargesProp, occupancy, rate, tagLine, since, interested: 0, owner: owner, bookingMoney
	});

	return res.send({
		success: 'Property Created Successfully',
		propertyCreated
	});
});

router.get('/:id', async (req, res) => {
	const {id} = req.params;
	const property = await properties.findById({id});
	await property.populate(['food', 'amenities', 'rules', 'otherCharges', 'reviews', 'owner'])
	res.send(property);
});

router.get('/:id/edit', isLoggedIn, isRoleProvider, async (req, res) => {
	const {id} = req.params;
	const property = await properties.findById({id});

	if (req.session.userRoleID !== property.owner)
		return res.status(403).send({error: 'Not Authorized!'});

	res.send({
		location: 'property edit page!',
		property
	});
});

router.patch('/:id', isLoggedIn, isRoleProvider, validatePropertyDetails, async (req, res) => {
	const {id} = req.params;
	const property = await properties.findById({id});

	if (req.session.userRoleID !== property.owner)
		return res.status(403).send({error: 'Not Authorized!'});

	const {
		addBuilding, addL1, addL2, landmark, state, city, zipCode, maxOccupancy, type, desc, food, foodText,
		amenities, amenitiesText, rules, otherCharges, otherChargesText, occupancy, rate, tagLine, since, bookingMoney
	} = req.body;

	const address = {
		...property.address,
		addBuilding, addL1, addL2, landmark, state, city, zipCode,
	};

	property.food.length = 0;
	food.forEach((v, idx) => {
		property.food.push({ name: v, detail: foodText[idx], path: `images/svg/${v}`});
	});

	property.amenities.length = 0;
	amenities.forEach((v, idx) => {
		property.amenities.push({ name: v, detail: amenitiesText[idx], path: `images/svg/${v}`});
	});

	const allRules = ['visitor-entry', 'non-veg-food', 'opposite-gender', 'smoking', 'drinking', 'loud-music', 'party'];
	property.rules.length = 0;
	allRules.forEach((v) => {
		property.rules.push({ name: v, allowed: rules.includes(v), path: `images/svg/${v}`});
	});

	property.otherCharges.length = 0;
	otherCharges.forEach((v, idx) => {
		property.otherCharges.push({name: v, detail: otherChargesText[idx], path: `images/svg/${v}`})
	});

	property.address = address;
	property.maxOccupancy = maxOccupancy;
	property.type = type;
	property.desc = desc;
	property.occupancy = occupancy;
	property.rate = rate;
	property.tagLine = tagLine;
	property.since = since;
	property.bookingMoney = bookingMoney;

	await property.save();

	res.send({success: 'property edited successfully'});
});

router.delete('/:id', isLoggedIn, isRoleAdminOrProvider, async (req, res) => {
	const {id} = req.params;
	const property = await properties.findById({id});

	if (req.session.userRoleID !== property.owner)
		return res.status(403).send({error: 'Not Authorized!'});

	await properties.deleteOne({id});
	return res.send({success: 'property deleted successfully'});
});

router.post('/:id/toggle', isLoggedIn, isRoleRider, async (req, res) => {
	const userId = req.session.userRoleID;
	const user = await riders.findById({userId});

	const id = req.params;
	const property = await properties.findById({id});

	let state;
	if (user.likes.includes(id)) {
		property.interested += 1;
		await riders.findOneAndUpdate({id}, {$pull: {likes: property}});
		state = false; // does not exist in likes of user now.
	}

	else {
		property.interested -= 1;
		await riders.findOneAndUpdate({id}, {$push: {likes: property}});
		state = true; // does exist in likes of user now.
	}

	await property.save();
	res.send({success: 'updated successfully', state});
});

module.exports = router;