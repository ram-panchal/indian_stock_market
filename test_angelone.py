import http.client
import mimetypes
conn = http.client.HTTPSConnection("apiconnect.angelone.in")
payload = "{\n\"clientcode\":\"CLIENT_ID\",\n\"password\":\"CLIENT_PIN\"\n,\n\"totp\":\"TOTP_CODE\"\n,\n\"state\":\"STATE_VARIABLE\"\n}"
headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
    'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
    'X-MACAddress': 'MAC_ADDRESS',
    'X-PrivateKey': 'API_KEY'
  }
conn.request(
    "POST", 
    "/rest/auth/angelbroking/user/v1/loginByPassword",
     payload,
     headers)

res = conn.getresponse()
data = res.read()
print(data.decode("utf-8"))
