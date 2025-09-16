from flask import Flask, jsonify, request, render_template  # Ajout de render_template
from flask_cors import CORS
import datetime
import pytz
import random

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["https://apero.mars.patatevolante.fr"]}})

timezones = {
    'France': {'timezones': ['Europe/Paris'], 'cities': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice']},
    'États-Unis': {'timezones': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'], 'cities': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix']},
    'Canada': {'timezones': ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns'], 'cities': ['Toronto', 'Montréal', 'Vancouver', 'Calgary', 'Edmonton']},
    'Australie': {'timezones': ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart'], 'cities': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide']},
    'Japon': {'timezones': ['Asia/Tokyo'], 'cities': ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Nagoya']},
    'Russie': {'timezones': ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka'], 'cities': ['Moscou', 'Saint-Pétersbourg', 'Novossibirsk', 'Ekaterinbourg', 'Kazan']},
    'Chine': {'timezones': ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi'], 'cities': ['Pékin', 'Shanghai', 'Tianjin', 'Chongqing', 'Shenzhen']},
    'Inde': {'timezones': ['Asia/Kolkata'], 'cities': ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad']},
    'Brésil': {'timezones': ['America/Sao_Paulo', 'America/Rio_Branco', 'America/Maceio', 'America/Belem', 'America/Fortaleza'], 'cities': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza']},
    'Argentine': {'timezones': ['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba', 'America/Argentina/Salta', 'America/Argentina/Jujuy', 'America/Argentina/Tucuman', 'America/Argentina/Catamarca', 'America/Argentina/La_Rioja', 'America/Argentina/San_Juan', 'America/Argentina/Mendoza', 'America/Argentina/Ushuaia', 'America/Argentina/Rio_Gallegos'], 'cities': ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'San Juan']},
    'Mexique': {'timezones': ['America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey', 'America/Matamoros', 'America/Mazatlan'], 'cities': ['Mexico City', 'Monterrey', 'Guadalajara', 'Puebla', 'Tijuana']},
    'Indonésie': {'timezones': ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'], 'cities': ['Jakarta', 'Surabaya', 'Medan', 'Bandung', 'Semarang']},
    'Philippines': {'timezones': ['Asia/Manila'], 'cities': ['Manille', 'Cebu', 'Davao', 'Iloilo', 'Pampanga']},
    'Corée du Sud': {'timezones': ['Asia/Seoul'], 'cities': ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon']},
    'Allemagne': {'timezones': ['Europe/Berlin', 'Europe/Busingen'], 'cities': ['Berlin', 'Hambourg', 'Munich', 'Cologne', 'Francfort']},
    'Espagne': {'timezones': ['Europe/Madrid', 'Atlantic/Canary'], 'cities': ['Madrid', 'Barcelone', 'Valence', 'Séville', 'Bilbao']},
    'Italie': {'timezones': ['Europe/Rome'], 'cities': ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo']},
    'Royaume-Uni': {'timezones': ['Europe/London'], 'cities': ['Londres', 'Manchester', 'Birmingham', 'Liverpool', 'Leeds']},
    'Émirats Arabes Unis': {'timezones': ['Asia/Dubai'], 'cities': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras al-Khaimah']},
    'Singapour': {'timezones': ['Asia/Singapore'], 'cities': ['Singapour', 'Kuala Lumpur', 'Bangkok', 'Jakarta', 'Manille']},
    'Hong Kong': {'timezones': ['Asia/Hong_Kong'], 'cities': ['Hong Kong', 'Macao', 'Shenzhen', 'Guangzhou', 'Shantou']},
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/apero-time', methods=['GET'])
def get_apero_time():
    user_timezone = request.args.get('timezone', 'Europe/Paris')
    user_tz = pytz.timezone(user_timezone)
    current_time = datetime.datetime.now(user_tz)
    is_apero_time = current_time.hour >= 17

    # Trouver les villes où l'apéro est en cours
    apero_now_cities = []
    for country, data in timezones.items():
        for tz in data['timezones']:
            try:
                country_tz = pytz.timezone(tz)
                country_time = current_time.astimezone(country_tz)
                apero_start_time = country_time.replace(hour=17, minute=0, second=0, microsecond=0)
                apero_end_time = country_time.replace(hour=23, minute=59, second=0, microsecond=0)
                if apero_start_time <= country_time <= apero_end_time:
                    apero_now_cities.append({
                        'country': country,
                        'city': random.choice(data['cities']),
                        'timezone': tz,
                    })
                    break  # Une ville par pays
            except pytz.UnknownTimeZoneError:
                continue

    # Sélectionner une seule ville aléatoire parmi celles où l'apéro est en cours
    apero_now_city = random.choice(apero_now_cities) if apero_now_cities else None

    return jsonify({
        'is_apero_time': is_apero_time,
        'apero_now_city': apero_now_city,  # Une seule ville
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
