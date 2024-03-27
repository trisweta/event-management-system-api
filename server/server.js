const express = require('express');
const csv = require('csv-parser');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

const app = express();
const PORT = 3000;
dotenv.config();

app.use(cors());
app.get('/', (req, res) => {
    res.send('Welcome to the Event Management System');
});

app.get('/events', (req, res) => {
    try {
        const allEvents = [];

        fs.createReadStream('./data/events.csv')
            .pipe(csv())
            .on('data', (row) => {
                allEvents.push(row);
            })
            .on('end', () => {
                res.status(200).json(allEvents);
            });
    } catch (error) {
        console.error('Error fetching all events:', error);
        res.status(500).send('Error fetching all events');
    }
});

app.get('/events/find', async (req, res) => {
    try {
        const { latitude, longitude, date, page } = req.query;
        const time = req.query.time || '';
        const pageSize = 10;

        if (!latitude || !longitude || !date || !page) {
            return res.status(400).json({ error: 'Latitude, longitude, date, and page are required' });
        }

        const startDate = new Date(date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 14);

        const events = [];
        const promises = [];

        fs.createReadStream('./data/events.csv')
            .pipe(csv())
            .on('data', (row) => {
                const eventDate = new Date(row.date);
                if (eventDate >= startDate && eventDate <= endDate) {
                    const { city_name } = row;

                    const code1 =process.env.code1;
                    const Wapiurl = process.env.weatherApiUrl;
                    const weatherPromise = axios.get(`${Wapiurl}code=${code1}==&city=${city_name}&date=${row.date}`)
                        .then((weatherRes) => {
                            const { weather } = weatherRes.data;
                            row.weather = weather;
                        })
                        .catch((error) => {
                            console.error('Error fetching weather:', error);
                        });
                    const code2 =process.env.code2;
                    const Dapiurl = process.env.distanceApiUrl;
                    const distancePromise = axios.get(`${Dapiurl}code=${code2}==&latitude1=${latitude}&longitude1=${longitude}&latitude2=${row.latitude}&longitude2=${row.longitude}`)
                        .then((distanceRes) => {
                            const { distance } = distanceRes.data;
                            row.distance_km = distance;
                        })
                        .catch((error) => {
                            console.error('Error fetching distance:', error);
                        });

                    promises.push(weatherPromise, distancePromise);
                    events.push(row);
                }
            })
            .on('end', () => {
                Promise.all(promises)
                    .then(() => {
                        events.sort((a, b) => {
                            const dateTimeA = new Date(`${a.date} ${a.time}`);
                            const dateTimeB = new Date(`${b.date} ${b.time}`);
                            return dateTimeA - dateTimeB;
                        });

                        const startIndex = (page - 1) * pageSize;
                        const endIndex = page * pageSize;
                        const paginatedEvents = events.slice(startIndex, endIndex);

                        const response = {
                            events: paginatedEvents.map(({ time, latitude, longitude, ...rest }) => rest),
                            page: parseInt(page),
                            pageSize: pageSize,
                            totalEvents: events.length,
                            totalPages: Math.ceil(events.length / pageSize),
                        };

                        res.status(200).json(response);
                    })
                    .catch((error) => {
                        console.error('Error:', error);
                        res.status(500).send('Internal Server Error');
                    });
            });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).send('Error fetching events');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});