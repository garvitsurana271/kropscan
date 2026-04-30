export interface WeatherData {
    temperature: number;
    condition: string;
    icon: string;
    isRainy: boolean;
    windSpeed: number;
    humidity: number;
}

// Map WMO codes to text/icon
const getWeatherCondition = (code: number): { condition: string; icon: string; isRainy: boolean } => {
    // https://open-meteo.com/en/docs
    if (code === 0) return { condition: 'Clear Sky', icon: 'wb_sunny', isRainy: false };
    if (code >= 1 && code <= 3) return { condition: 'Partly Cloudy', icon: 'cloud_queue', isRainy: false };
    if (code >= 45 && code <= 48) return { condition: 'Foggy', icon: 'blur_on', isRainy: false }; // 'foggy' not found in some icon sets, using 'blur_on'
    if (code >= 51 && code <= 67) return { condition: 'Rain', icon: 'rainy', isRainy: true };
    if (code >= 80 && code <= 82) return { condition: 'Showers', icon: 'shower', isRainy: true };
    if (code >= 95) return { condition: 'Thunderstorm', icon: 'thunderstorm', isRainy: true };

    return { condition: 'Cloudy', icon: 'cloud', isRainy: false };
};

export const fetchWeather = async (lat: number, lon: number): Promise<WeatherData | null> => {
    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`
        );
        const data = await response.json();
        const current = data.current;

        const { condition, icon, isRainy } = getWeatherCondition(current.weather_code);

        return {
            temperature: current.temperature_2m,
            condition,
            icon,
            isRainy,
            windSpeed: current.wind_speed_10m,
            humidity: current.relative_humidity_2m
        };
    } catch (error) {
        console.error('Failed to fetch weather:', error);
        return null;
    }
};
