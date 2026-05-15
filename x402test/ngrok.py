from pyngrok import ngrok

# Set your auth token locally (DO NOT hardcode in shared code)
ngrok.set_auth_token("2kEGVmoK5L1A7fSTRJ6k4n7YMkl_3jBZXFdHfibFjz6fh9LAN")

# Open a tunnel to port 3000
public_url = ngrok.connect(3000, "http")

print("Tunnel started!")
print("Public URL:", public_url)

# Keep script running
input("Press Enter to stop tunnel...\n")

ngrok.disconnect(public_url)
ngrok.kill()