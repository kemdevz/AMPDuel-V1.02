--// Configuration
local website = "https://bloxdice.com"
-- Set this at runtime; never commit the bot secret into this file.
local runtimeConfig = (getgenv and getgenv()) or _G
local auth = tostring(runtimeConfig.PS99_BOT_API_SECRET or "")

if auth == "" or auth == "REPLACE_WITH_PS99_BOT_API_SECRET" then
    warn("[PS99 Trade Bot] Set PS99_BOT_API_SECRET in getgenv() before running the bot.")
    return
end

print("[PS99 Trade Bot] Starting initialization...")

--// Wait for game to load
repeat task.wait() until game:IsLoaded()
task.wait(5) -- Additional wait for modules to replicate

print("[PS99 Trade Bot] Game loaded, getting services...")

--// Variables
local players            = game:GetService("Players")
local replicatedStorage  = game:GetService("ReplicatedStorage")
local httpService        = game:GetService("HttpService")
local virtualUser        = game:GetService("VirtualUser")
local textChatService    = game:GetService("TextChatService")
local teleportService    = game:GetService("TeleportService")

local localPlayer        = players.LocalPlayer

print("[PS99 Trade Bot] Waiting for PlayerGui...")
local playerGUI          = localPlayer:WaitForChild("PlayerGui", 30)
if not playerGUI then
    warn("[PS99 Trade Bot] Failed to find PlayerGui!")
    return
end

print("[PS99 Trade Bot] Waiting for TradeWindow...")
local tradingWindow      = playerGUI:WaitForChild("TradeWindow", 30)
if not tradingWindow then
    warn("[PS99 Trade Bot] Failed to find TradeWindow!")
    return
end

local tradingMessage     = playerGUI:WaitForChild("Message", 30)
local tradingStatus      = tradingWindow:WaitForChild("Frame"):WaitForChild("PlayerItems"):WaitForChild("Status")
local tradingMessages    = tradingWindow:WaitForChild("Frame"):WaitForChild("ChatOverlay"):WaitForChild("Messages")

print("[PS99 Trade Bot] Waiting for Library...")
local library            = replicatedStorage:WaitForChild("Library", 30)
if not library then
    warn("[PS99 Trade Bot] Failed to find Library!")
    return
end

print("[PS99 Trade Bot] Loading modules...")

-- Wait for Client folder
local clientFolder = library:WaitForChild("Client", 30)
if not clientFolder then
    warn("[PS99 Trade Bot] Failed to find Client folder!")
    return
end

task.wait(3) -- Give modules more time to load

-- Try loading Save module with retries
local saveModule
local attempts = 0
repeat
    attempts = attempts + 1
    local success, result = pcall(function()
        return require(clientFolder:WaitForChild("Save"))
    end)
    
    if success then
        saveModule = result
        print("[PS99 Trade Bot] Save module loaded!")
        break
    else
        warn("[PS99 Trade Bot] Save module attempt", attempts, "failed:", result)
        task.wait(2)
    end
until attempts >= 5

if not saveModule then
    warn("[PS99 Trade Bot] Failed to load Save module after 5 attempts!")
    return
end

-- Try loading TradingCmds module with retries
local tradingCommands
attempts = 0
repeat
    attempts = attempts + 1
    local success, result = pcall(function()
        return require(clientFolder:WaitForChild("TradingCmds"))
    end)
    
    if success then
        tradingCommands = result
        print("[PS99 Trade Bot] TradingCmds module loaded!")
        break
    else
        warn("[PS99 Trade Bot] TradingCmds module attempt", attempts, "failed:", result)
        task.wait(2)
    end
until attempts >= 5

if not tradingCommands then
    warn("[PS99 Trade Bot] Failed to load TradingCmds module after 5 attempts!")
    return
end

-- Debug: Print all TradingCmds functions
print("[PS99 Trade Bot] TradingCmds functions:")
for functionName, func in pairs(tradingCommands) do
    if type(func) == "function" then
        print("  -", functionName)
    end
end

print("[PS99 Trade Bot] All modules loaded successfully!")

local tradingItems       = {}
local tradeId            = 0
local startTick          = tick()
local tradeUser          = nil
local goNext             = true
local supportedPets      = {}
local gems               = 0

--// Initializing
print("[PS99 Trade Bot] initializing variables...")

local request = request or http_request or (http and http.request)

if not request then
    warn("[PS99 Trade Bot] HTTP request function not found! Make sure HTTP is enabled in your executor.")
    return
end

local function apiRequest(path, payload, maxAttempts)
	maxAttempts = maxAttempts or 1
	local lastError = "Request failed"
	for attempt = 1, maxAttempts do
		local ok, response = pcall(function()
			return request({
				Url = website .. path,
				Method = "POST",
				Body = httpService:JSONEncode(payload),
				Headers = {
					["Content-Type"] = "application/json",
					["Authorization"] = "Bearer " .. auth
				}
			})
		end)

		if ok and response then
			local statusCode = tonumber(response.StatusCode) or 0
			local decodedOk, decoded = pcall(function()
				return httpService:JSONDecode(response.Body or "{}")
			end)
			if statusCode >= 200 and statusCode < 300 and decodedOk then
				return decoded
			end
			lastError = "HTTP " .. tostring(statusCode) .. ": " .. tostring(response.Body)
			if statusCode >= 400 and statusCode < 500 then
				error(lastError)
			end
		else
			lastError = tostring(response)
		end

		if attempt < maxAttempts then
			task.wait(math.min(2 ^ (attempt - 1), 8))
		end
	end
	error(lastError)
end

local function gemNameToAmount(name)
	local number, suffix = string.match(tostring(name), "^(%d+)([KM]) gems$")
	if not number then return nil end
	local multipliers = { K = 1000, M = 1000000 }
	return tonumber(number) * multipliers[suffix]
end

local function releaseWithdrawalClaim(claimToken)
	if not claimToken or claimToken == "" or not tradeUser then return end
	local ok, result = pcall(function()
		return apiRequest("/withdraw/release", {
			["userId"] = tostring(tradeUser),
			["botUserId"] = tostring(localPlayer.UserId),
			["claimToken"] = claimToken,
			["game"] = "PS99"
		}, 3)
	end)
	if not ok then
		warn("[Withdraw] Failed to release claim; it will expire automatically:", result)
	end
end

--// Functions
print("[PS99 Trade Bot] initializing functions...")

-- Gets the user's pets in their inventory with retry mechanism
local function getHugesTitanics(hugesTitanicsIds, retryCount)
	local hugesTitanics = {}
	retryCount = retryCount or 0
	
	local inventory = saveModule.Get().Inventory.Pet
	if not inventory then
	    warn("[PS99 Trade Bot] Failed to get inventory!")
	    
	    -- Retry up to 2 times if inventory fails to load
	    if retryCount < 2 then
	        warn("[PS99 Trade Bot] Retrying inventory fetch... Attempt:", retryCount + 1)
	        task.wait(1)
	        return getHugesTitanics(hugesTitanicsIds, retryCount + 1)
	    end
	    
	    return hugesTitanics
	end
	
	for uuid, pet in next, inventory do
		if table.find(hugesTitanicsIds, pet.id) then
			table.insert(hugesTitanics, {
                ["uuid"]   = uuid,
                ["id"]     = pet.id,
                ["type"]   = (pet.pt == 1 and "Golden") or (pet.pt == 2 and "Rainbow") or "Normal",
                ["shiny"]  = pet.sh or false
            })
		end
	end
	
	print("[Inventory Check] Found", #hugesTitanics, "huge/titanic pets in inventory")
	
	return hugesTitanics
end

-- Gets all new trade requests
local function getTrades()
	local trades          = {}
	local functionTrades  = tradingCommands.GetAllRequests()
	
	for player, trade in next, functionTrades do
		if trade[localPlayer] then
			table.insert(trades, player)
		end
	end
	
	return trades
end

local function strictgem()
	local gems_value = localPlayer.PlayerGui.MainLeft.Left.Currency.Diamonds.Diamonds.Amount.Text
	return gems_value
end

local function client_currencies_gems()
	local gems_value = localPlayer.PlayerGui.MainLeft.Left.Currency.Diamonds.Diamonds.Amount.Text
	local cleanText = gems_value:gsub(",", "")
	local gemNumber = tonumber(cleanText)
	return gemNumber
end

local function client_trade_gems()
	local gemText = localPlayer.PlayerGui.TradeWindow.Frame.ClientDiamonds.Diamonds.Input.PlaceholderText
	return gemText
end

local function client_trade_gems_2()
	local ok, gemNumber = pcall(function()
		local gemText = localPlayer.PlayerGui.TradeWindow.Frame.PlayerDiamonds.TextLabel.Text
		local cleanText = tostring(gemText):gsub(",", ""):gsub("%s", "")
		return tonumber(cleanText)
	end)
	return ok and gemNumber or 0
end

local GEM_PACKAGES = {
	{ name = "100M gems", amount = 100000000 },
	{ name = "50M gems", amount = 50000000 },
	{ name = "25M gems", amount = 25000000 },
	{ name = "10M gems", amount = 10000000 },
	{ name = "5M gems", amount = 5000000 },
	{ name = "1M gems", amount = 1000000 },
	{ name = "500K gems", amount = 500000 },
	{ name = "100K gems", amount = 100000 }
}

local function gemAmountToPackages(amount)
	amount = tonumber(amount) or 0
	if amount == 0 then return {} end
	if amount < 100000 or amount % 100000 ~= 0 then
		return nil, "Gem deposits must be in exact 100K increments."
	end

	local packages = {}
	local remaining = amount
	for _, package in ipairs(GEM_PACKAGES) do
		while remaining >= package.amount do
			table.insert(packages, package.name)
			remaining = remaining - package.amount
			if #packages > 50 then
				return nil, "Deposit is too large; use fewer than 50 item packages."
			end
		end
	end
	if remaining ~= 0 then
		return nil, "Unable to represent the deposited gems exactly."
	end
	return packages
end

-- Returns 0 if your not in a trade
local function getTradeId()
	return (tradingCommands.GetState() and tradingCommands.GetState()._id) or 0
end
-- Accept trade request
local function acceptTradeRequest(player)
	return tradingCommands.Request(player)
end
-- Reject trade request
local function rejectTradeRequest(player)
	return tradingCommands.Reject(player)
end
-- Readys the actual trade
local function readyTrade()
	print("[readyTrade] Attempting to ready trade...")
	local success, result = pcall(function()
		return tradingCommands.SetReady(true)
	end)
	
	if not success then
		warn("[readyTrade] Failed to ready trade:", result)
		return false
	else
		print("[readyTrade] Successfully called SetReady(true), result:", result)
		return result
	end
end
-- Declines the actual trade
local function declineTrade()
	return tradingCommands.Decline()
end
-- Adds pet to trade
local function addPet(uuid)
	return tradingCommands.SetItem("Pet", uuid, 1)
end
-- Adds gems to trade
local function addGems(amount)
	print("[addGems] Attempting to add gems:", amount)
	
	-- PS99 likely uses "Diamonds" as the currency name
	-- Try different currency names for PS99
	local currencyNames = {"Diamonds", "Gems", "Money", "Coins", "Currency", "Diamond"}
	
	for _, currencyName in ipairs(currencyNames) do
		local trySuccess, tryResult = pcall(function()
			print("[addGems] Trying currency name:", currencyName)
			local result = tradingCommands.SetCurrency(currencyName, amount)
			print("[addGems] Result for", currencyName, ":", result)
			return result
		end)
		
		if trySuccess and tryResult then
			print("[addGems] Successfully added gems using:", currencyName)
			return true
		elseif not trySuccess then
			print("[addGems] Failed with", currencyName, ":", tryResult)
		end
	end
	
	print("[addGems] Failed to add gems with all currency names")
	return false
end

-- Chat message (In Chat / PS99 Chat)
local function sendMessage(message)
	pcall(function()
		textChatService.TextChannels.RBXGeneral:SendAsync("RbxRoyale | "..message)
	end)
	pcall(function()
        task.wait(0.1)
		tradingCommands.Message("RbxRoyale | "..message)
	end)
	
	return true
end

-- Gets name of pet through asset id
local function getName(assetIds, assetId)
	for index, petData in next, assetIds do
		if table.find(petData.assetIds, assetId) then
			return petData.name
		end
	end
	
	return "???"
end

-- Check for huges / titanics
local function checkItems(assetIds, goldAssetids, nameAssetIds)
	local items              = {}
	local itemTotal          = 0
	local onlyHugesTitanics  = true
	local unsupportedPets    = {}
	
	print("[Pet Check] Starting checkItems...")
	
	for index, item in next, tradingWindow.Frame.PlayerItems.Items:GetChildren() do
		if item.Name == "ItemSlot" then
			itemTotal = itemTotal + 1
			
			local name    = getName(nameAssetIds, item.Icon.Image)
			local rarity  = (item.Icon:FindFirstChild("RainbowGradient") and "Rainbow") or (table.find(goldAssetids, item.Icon.Image) and "Golden") or "Normal"
			local shiny   = (item:FindFirstChild("ShinePulse") and true) or false

            local petstring = (shiny and "Shiny " or "")..((rarity == "Golden" and "Golden ") or (rarity == "Rainbow" and "Rainbow ") or "")..name
			
			print("[Pet Check] Checking item:", petstring)
			
			-- Check if it's a huge/titanic pet
			if not table.find(assetIds, item.Icon.Image) then
				onlyHugesTitanics = false
				break
			else
				-- Check if pet is in supported list from backend
				if not supportedPets[petstring] then
					print("[Pet Check] UNSUPPORTED PET:", petstring)
					table.insert(unsupportedPets, name)
				end
				
				table.insert(items, petstring)
			end
		end 
	end
	
	print("[Pet Check] itemTotal:", itemTotal, "onlyHugesTitanics:", onlyHugesTitanics, "unsupportedCount:", #unsupportedPets)
	
	if itemTotal > 0 and not onlyHugesTitanics then
		return true, "Please Deposit Only Huges / Titanics or Gem Items"
	elseif #unsupportedPets > 0 then
		return true, "Unsupported pets: " .. table.concat(unsupportedPets, ", ") .. " - Check website for accepted pets"
	else
		return false, items
	end
end

local function collectDepositOffer(assetIds, goldAssetids, nameAssetIds)
	local hasError, petItems = checkItems(assetIds, goldAssetids, nameAssetIds)
	if hasError then return nil, nil, petItems end

	local gemItems, gemError = gemAmountToPackages(client_trade_gems_2())
	if not gemItems then return nil, nil, gemError end
	if #petItems == 0 and #gemItems == 0 then
		return nil, nil, "Please deposit Huge/Titanic pets or at least 100K gems."
	end
	if #petItems + #gemItems > 50 then
		return nil, nil, "A deposit can contain at most 50 credited items."
	end
	return petItems, gemItems, nil
end

local function sameItemMultiset(left, right)
	if #left ~= #right then return false end
	local counts = {}
	for _, name in ipairs(left) do counts[name] = (counts[name] or 0) + 1 end
	for _, name in ipairs(right) do
		if not counts[name] or counts[name] == 0 then return false end
		counts[name] = counts[name] - 1
	end
	return true
end

--// Misc Scripts
print("[PS99 Trade Bot] initializing misc features...")

--// Auto-Rejoin on Disconnect
print("[PS99 Trade Bot] Setting up auto-rejoin...")
local currentPlaceId = game.PlaceId
local currentJobId = game.JobId

-- Detect kicks/disconnects and rejoin
game:GetService("CoreGui").ChildRemoved:Connect(function(child)
	if child.Name == "RobloxPromptGui" then
		print("[Auto-Rejoin] Detected disconnect, rejoining...")
		task.wait(1)
		teleportService:TeleportToPlaceInstance(currentPlaceId, currentJobId, localPlayer)
	end
end)

-- Alternative disconnect detection
localPlayer.OnTeleport:Connect(function(State)
	if State == Enum.TeleportState.Failed then
		print("[Auto-Rejoin] Teleport failed, rejoining...")
		task.wait(2)
		teleportService:Teleport(currentPlaceId, localPlayer)
	end
end)

-- Kick detection
local oldIndex
oldIndex = hookmetamethod(game, "__namecall", function(self, ...)
	local method = getnamecallmethod()
	local args = {...}
	
	if method == "Kick" then
		print("[Auto-Rejoin] Kick detected, rejoining...")
		task.wait(0.5)
		teleportService:Teleport(currentPlaceId, localPlayer)
		return
	end
	
	return oldIndex(self, ...)
end)

--// Anti-AFK 
localPlayer.Idled:Connect(function()
    virtualUser:Button2Down(Vector2.new(0,0),workspace.CurrentCamera.CFrame)
    task.wait(1)
    virtualUser:Button2Up(Vector2.new(0,0),workspace.CurrentCamera.CFrame)
end)

--// Huges / Titanic detection
print("[PS99 Trade Bot] initializing detections...")

local assetIds          = {}
local goldAssetids      = {}
local nameAssetIds      = {}
local hugesTitanicsIds  = {}

print("[PS99 Trade Bot] Fetching supported pets from backend...")
local fetchSuccess, fetchResult = pcall(function()
	local response = request({
		Url = website .. "/items/all",
		Method = "GET",
		Headers = {
			["Content-Type"] = "application/json"
		}
	})
	
	if response.StatusCode == 200 then
		local data = httpService:JSONDecode(response.Body)
		if data.success == "OK" and data.items then
			for _, petName in ipairs(data.items) do
				supportedPets[petName] = true
			end
			print("[PS99 Trade Bot] Loaded " .. #data.items .. " supported pets from backend")
			return true
		end
	end
	return false
end)

if not fetchSuccess or not fetchResult then
	warn("[PS99 Trade Bot] Failed to fetch supported pets from backend!")
	warn("[PS99 Trade Bot] Error:", fetchResult)
end

print("[PS99 Trade Bot] Waiting for pet directories...")
local petsDir = replicatedStorage:WaitForChild("__DIRECTORY"):WaitForChild("Pets", 30)
if not petsDir then
    warn("[PS99 Trade Bot] Failed to find Pets directory!")
    return
end

-- Huges
local hugeFolder = petsDir:FindFirstChild("Huge")
if hugeFolder then
    for index, pet in next, hugeFolder:GetChildren() do
        local success, petData = pcall(function()
            return require(pet)
        end)
        
        if success and petData then
            table.insert(assetIds, petData.thumbnail)
            table.insert(assetIds, petData.goldenThumbnail)
            table.insert(goldAssetids, petData.goldenThumbnail)
            table.insert(nameAssetIds, {
                ["name"]      = petData.name,
                ["assetIds"]  = {
                    petData.thumbnail,
                    petData.goldenThumbnail
                }
            })
            table.insert(hugesTitanicsIds, petData._id)
        end
    end
    print("[PS99 Trade Bot] Loaded", #hugesTitanicsIds, "Huge pets from game")
else
    warn("[PS99 Trade Bot] Huge folder not found!")
end

-- Titanics
local titanicFolder = petsDir:FindFirstChild("Titanic")
if titanicFolder then
    local titanicCount = 0
    for index, pet in next, titanicFolder:GetChildren() do
        local success, petData = pcall(function()
            return require(pet)
        end)
        
        if success and petData then
            table.insert(assetIds, petData.thumbnail)
            table.insert(assetIds, petData.goldenThumbnail)
            table.insert(goldAssetids, petData.goldenThumbnail)
            table.insert(nameAssetIds, {
                ["name"]      = petData.name,
                ["assetIds"]  = {
                    petData.thumbnail,
                    petData.goldenThumbnail
                }
            })
            table.insert(hugesTitanicsIds, petData._id)
            titanicCount = titanicCount + 1
        end
    end
    print("[PS99 Trade Bot] Loaded", titanicCount, "Titanic pets from game")
else
    warn("[PS99 Trade Bot] Titanic folder not found!")
end

--// Trade ID setting
spawn(function()
	while task.wait(1) do
		tradeId = getTradeId()
	end
end)

--// Connection Functions
print("[PS99 Trade Bot] initializing connects...")

-- Timeout function to reset trade state if it gets stuck
local function setupTradeTimeout(localId, maxTimeout)
	spawn(function()
		local startTime = tick()
		while task.wait(1) do
			-- If trade ID changed or max timeout reached, reset
			if tradeId ~= localId or (tick() - startTime) > maxTimeout then
				if (tick() - startTime) > maxTimeout then
					print("[Trade Timeout] Trade took too long, resetting... LocalID:", localId)
					sendMessage("Trade timed out - Please try again")
				end
				goNext = true
				break
			end
		end
	end)
end

-- Detect accept / declining of the trade
local function connectMessage(localId, method, tradingItemsFunc, withdrawalContext)
	local messageConnection
	local tradeCompleted = false
	local depositSent = false
	
	messageConnection = tradingMessage:GetPropertyChangedSignal("Enabled"):Connect(function()
        print("[Trade Message]", tradingMessage.Enabled, "TradeID:", tradeId, "LocalID:", localId)
		
		-- Disconnect if trade ID changed or already completed
		if tradeId ~= localId or tradeCompleted then
			print("MESSAGE DISCONNECTION - Trade ID Changed or Completed", localId, tradeId, tradeUser, 1)
			goNext = true
			messageConnection:Disconnect()
			return
		end
		
		if tradingMessage.Enabled then
			local text = tradingMessage.Frame.Contents.Desc.Text
			print("[Trade Message Text]:", text)
			
			-- Check for both possible success messages
			if (text == "✅ Trade successfully completed!" or string.find(text, "Trade success")) and not tradeCompleted then
				tradeCompleted = true
				sendMessage("Trade Completed!")
                print(method)
                if method == "deposit" and not depositSent then
					depositSent = true
                    print("DEPOSIT")
                    print("[Deposit] Using tradingItemsFunc parameter with", #tradingItemsFunc, "pets")
                    for i,v in next, tradingItemsFunc do
                        print(i,v)
                    end

                    local depositPayload = {
                        ["userId"] = tradeUser,
                        ["pets"] = tradingItemsFunc,
                        ["gems"] = gems,  -- Now an array of gem item names
                        ["game"] = "PS99",
                        ["tradeId"] = tostring(game.JobId) .. ":" .. tostring(localId),
                        ["botUserId"] = tostring(localPlayer.UserId)
                    }
                    
                    print("[Deposit API] Sending deposit request...")
                    print("[Deposit API] UserId:", tradeUser)
                    print("[Deposit API] Pets count:", #tradingItemsFunc)
                    print("[Deposit API] Payload:", httpService:JSONEncode(depositPayload))
                    
                    local depositSuccess, depositResult = pcall(function()
                        return apiRequest("/deposit/deposit", depositPayload, 5)
                    end)
                    
                    if not depositSuccess then
                        warn("[Deposit API] Request failed:", depositResult)
                        sendMessage("Deposit failed - contact admin!")
                    else
                        print("[Deposit API] Deposit successful:", httpService:JSONEncode(depositResult))
                        sendMessage("Deposit successful! Check your balance on the website.")
                    end

                    messageConnection:Disconnect()
                    print("MESSAGE DISCONNECTION - Trade Completed", localId, tradeId, tradeUser, 5)
                    task.wait(1)
                    tradingMessage.Enabled = false
                    goNext = true
                else
                    print("withdraw :)")
                    print(tradeUser)
                    print("CONFIRM PARTIAL WITHDRAW")
                    print(tradeUser)
                    for i,v in next, tradingItemsFunc do
                        print(i,v)
                    end

                    local withdrawSuccess, withdrawResult = pcall(function()
                        return apiRequest("/withdraw/withdrawn", {
                            ["userId"] = tostring(tradeUser),
                            ["withdrawalIds"] = withdrawalContext.withdrawalIds,
                            ["claimToken"] = withdrawalContext.claimToken,
                            ["tradeId"] = tostring(game.JobId) .. ":" .. tostring(localId),
                            ["botUserId"] = tostring(localPlayer.UserId),
                            ["game"] = "PS99"
                        }, 5)
                    end)

                    if not withdrawSuccess then
                        warn("[Withdraw Complete] CRITICAL: trade completed but finalization failed:", withdrawResult)
                        sendMessage("Withdrawal delivered, but logging failed. Please contact an admin.")
                    else
                        print("[Withdraw Complete] Finalized:", httpService:JSONEncode(withdrawResult))
                    end
					
					messageConnection:Disconnect()
					print("MESSAGE DISCONNECTION - Withdraw Completed", localId, tradeId, tradeUser, 4)
					task.wait(1)
					tradingMessage.Enabled = false
					goNext = true
                end
			elseif (string.find(text, " cancelled the trade!")) and not tradeCompleted then
				tradeCompleted = true
				if method == "withdraw" and withdrawalContext then
					releaseWithdrawalClaim(withdrawalContext.claimToken)
				end
				sendMessage("Trade Declined")
                print("MESSAGE DISCONNECTION - Trade Cancelled", localId, tradeId, tradeUser, 3)
				messageConnection:Disconnect()
				
				task.wait(1)
				tradingMessage.Enabled = false
                goNext = true
            elseif string.find(text, "left the game") and not tradeCompleted then
				tradeCompleted = true
				if method == "withdraw" and withdrawalContext then
					releaseWithdrawalClaim(withdrawalContext.claimToken)
				end
                sendMessage("Trade Declined")
                print("MESSAGE DISCONNECTION - User Left", localId, tradeId, tradeUser, 2)
                messageConnection:Disconnect()
				
				task.wait(1)
				tradingMessage.Enabled = false
                goNext = true
			end
		end
	end)
end

-- Detect when both players confirm and auto-accept
local function connectConfirm(localId, method, tradingItemsFunc, depositGemItems)
	local hasConfirmed = false
	
	-- Simple approach: wait a bit after we're ready, then auto-confirm
	spawn(function()
		task.wait(2) -- Wait 2 seconds after ready
		
		if tradeId == localId and not hasConfirmed then
			if method == "deposit" then
				local currentPets, currentGems, validationError = collectDepositOffer(assetIds, goldAssetids, nameAssetIds)
				if validationError
					or not sameItemMultiset(tradingItemsFunc, currentPets or {})
					or not sameItemMultiset(depositGemItems or {}, currentGems or {}) then
					warn("[Auto Confirm] Deposit offer changed or became invalid:", validationError or "offer changed")
					sendMessage("Your deposit changed after validation. Please try again.")
					pcall(declineTrade)
					goNext = true
					return
				end
			end
			hasConfirmed = true
			print("[Auto Confirm] Attempting to confirm trade...")
			
			-- Use SetConfirmed to confirm the trade
			local confirmSuccess, confirmError = pcall(function()
				print("[Auto Confirm] Calling TradingCmds.SetConfirmed(true)...")
				tradingCommands.SetConfirmed(true)
			end)
			
			if not confirmSuccess then
				warn("[Auto Confirm] SetConfirmed failed:", confirmError)
			else
				print("[Auto Confirm] Trade confirmed successfully!")
			end
			
			if not confirmSuccess then
				print("[Auto Confirm] Direct confirm failed, trying button click method...")
				
				-- Fallback: Try to find and click confirm button
				local confirmButton = tradingWindow.Frame:FindFirstChild("Confirm", true)
				if confirmButton and confirmButton:IsA("GuiButton") then
					print("[Auto Confirm] Found Confirm button, clicking...")
					
					for _, connection in pairs(getconnections(confirmButton.MouseButton1Click)) do
						connection:Fire()
					end
					
					task.wait(0.5)
					
					-- Look for Yes button
					local yesButton = playerGUI:FindFirstChild("Yes", true) or playerGUI:FindFirstChild("ConfirmTrade", true)
					if not yesButton and tradingMessage and tradingMessage:FindFirstChild("Frame") then
						yesButton = tradingMessage.Frame:FindFirstChild("Yes", true) or tradingMessage.Frame:FindFirstChild("Confirm", true)
					end
					
					if yesButton and yesButton:IsA("GuiButton") then
						print("[Auto Confirm] Found Yes button, clicking...")
						for _, connection in pairs(getconnections(yesButton.MouseButton1Click)) do
							connection:Fire()
						end
					end
				else
					print("[Auto Confirm] Confirm button not found - trade may need manual confirmation")
				end
			end
		end
	end)
end

-- Monitor trade window to detect if it closes unexpectedly
local function connectTradeWindow(localId)
	local windowConnection
	
	windowConnection = tradingWindow:GetPropertyChangedSignal("Enabled"):Connect(function()
		if not tradingWindow.Enabled and tradeId == localId then
			print("[Trade Window] Trade window closed unexpectedly for LocalID:", localId)
			goNext = true
			windowConnection:Disconnect()
		elseif tradeId ~= localId then
			windowConnection:Disconnect()
		end
	end)
end

-- Detect when user accepts, make various checks, and accepts the trade
local function connectStatus(localId, method, tradingItemsFunc, withdrawalContext)
	local statusConnection
	local hasSetupListeners = false
	
	-- Set up timeout (180 seconds max)
	setupTradeTimeout(localId, 180)
	
	-- Monitor trade window closure
	connectTradeWindow(localId)
	
	statusConnection = tradingStatus:GetPropertyChangedSignal("Visible"):Connect(function()
		if tradeId == localId then
			if tradingStatus.Visible and not hasSetupListeners then
				hasSetupListeners = true
				
				if method == "deposit" then
                    print("[connectStatus] Deposit method detected, checking items...")
                    local output, gemItems, depositError = collectDepositOffer(assetIds, goldAssetids, nameAssetIds)

                    if depositError then
                        print("[connectStatus] Deposit validation failed:", depositError)
                        sendMessage(depositError)
                        hasSetupListeners = false
                    else
                        gems = gemItems
                        
                        if tradingStatus.Visible then
                            print("[connectStatus] Items validated, preparing to ready trade...")
                            print("[connectStatus] Gems to deposit:", #gems)
                            print("[connectStatus] About to call readyTrade()...")
                            local readyResult = readyTrade()
                            print("[connectStatus] readyTrade() returned:", readyResult)
                            tradingItems = output
                            -- Set up confirm listener to auto-confirm when both ready
                            connectConfirm(localId, method, output, gemItems)
                            -- Set up message listener AFTER ready to avoid premature disconnection
                            task.wait(0.5)
                            connectMessage(localId, method, output, withdrawalContext)
                            statusConnection:Disconnect()
                        end
                    end
                else
                    print("[connectStatus] Withdraw method detected")
                    -- Check for pets
                    local error, output = checkItems(assetIds, goldAssetids, nameAssetIds)
                    print("[connectStatus] checkItems returned - error:", error, "output:", output)
                    
                    if error or #output > 0 or client_trade_gems_2() > 0 then
                        print("[connectStatus] User added items or gems during withdraw - declining")
                        sendMessage("Please don't add pets or gems while withdrawing!")
                        hasSetupListeners = false
                    else
                        print("[connectStatus] About to call readyTrade() for withdraw...")
                        local readyResult = readyTrade()
                        print("[connectStatus] readyTrade() returned:", readyResult)
                        -- Set up confirm listener to auto-confirm when both ready
                        connectConfirm(localId, method, tradingItemsFunc)
                        -- Set up message listener AFTER ready to avoid premature disconnection
                        task.wait(0.5)
                        connectMessage(localId, method, tradingItemsFunc, withdrawalContext)
                        statusConnection:Disconnect()
                    end
                end
			end
		else
			statusConnection:Disconnect()
		end
	end)
end

--// Main Script
print("[PS99 Trade Bot] initializing main script...")

spawn(function()
	while task.wait(1) do
		pcall(function()
			local incomingTrades = getTrades()
			
			if #incomingTrades > 0 and goNext then
				local trade        = incomingTrades[1]
				local username     = trade.Name
				tradeUser          = players:GetUserIdFromNameAsync(username)
				local claimToken   = tostring(game.JobId) .. ":" .. tostring(localPlayer.UserId) .. ":" .. tostring(tradeUser)
				print(username, tradeUser)

				-- Retry mechanism for new users (check up to 3 times with delays)
				local response
				local maxRetries = 3
				local retryDelay = 2
				
				for attempt = 1, maxRetries do
					print("[User Check] Attempt", attempt, "of", maxRetries, "for user:", username)
					
					response = apiRequest("/withdraw/method", {
						["userId"] = tostring(tradeUser),
						["botUserId"] = tostring(localPlayer.UserId),
						["claimToken"] = claimToken,
						["game"] = "PS99"
					}, 3)

					print("[User Check] Method:", response["method"])
					
					-- If user is found, break out of retry loop
					if response["method"] ~= "USERNOTFOUND" then
						print("[User Check] User found on attempt", attempt)
						break
					end
					
					-- If not found and not last attempt, wait and retry
					if attempt < maxRetries then
						print("[User Check] User not found, waiting", retryDelay, "seconds before retry...")
						task.wait(retryDelay)
					end
				end
				
				if response["method"] == "USERNOTFOUND" then
					sendMessage("Please register on the website before trading, " .. username)
					pcall(function()
						rejectTradeRequest(trade)
					end)
				elseif response["method"] == "BUSY" then
					sendMessage("Your withdrawal is currently assigned to another bot. Please try again shortly.")
					pcall(function()
						rejectTradeRequest(trade)
					end)
				else
					local accepted = acceptTradeRequest(trade)
						
					if not accepted then
						print("[Trade Accept] Failed to accept trade with:", username)
						if response["method"] == "Withdraw" then
							releaseWithdrawalClaim(response["claimToken"] or claimToken)
						end
						pcall(function()
							rejectTradeRequest(trade)
						end)
						goNext = true
						return
					end

					local localId  = getTradeId()
					tradeId        = localId
					
					-- Double check we got a valid trade ID
					if localId == 0 then
						print("[Trade Accept] Trade ID is 0, something went wrong")
						if response["method"] == "Withdraw" then
							releaseWithdrawalClaim(response["claimToken"] or claimToken)
						end
						goNext = true
						return
					end

					if response["method"] == "Withdraw" then
						local withdrawData  = response["pets"] or {}
						local withdrawGems  = response["gems"] or {}
						local withdrawalRows = response["withdrawals"] or {}
						local withdrawalContext = {
							claimToken = response["claimToken"] or claimToken,
							withdrawalIds = {}
						}
						local newWithdrawData = {}
						
						-- Match pets against pet inventory; gem packages are handled as
						-- diamond currency after pet matching.
						local allWithdrawItems = {}
						for _, pet in ipairs(withdrawData) do
							table.insert(allWithdrawItems, pet)
						end
						
						-- First inventory check for pets only
						local petInventory  = getHugesTitanics(hugesTitanicsIds)
						print("[Withdraw] First inventory check found", #petInventory, "pets")
						
						-- Double-check: Refresh inventory if it seems empty or insufficient
						if #petInventory < 10 then
							print("[Withdraw] Inventory seems low, doing double-check...")
							task.wait(0.5)
							petInventory = getHugesTitanics(hugesTitanicsIds)
							print("[Withdraw] Double-check found", #petInventory, "pets")
						end
						
						local usedPets      = {}
						local usedPetsNames = {}
						local usedPetsNamesTemp = {}
						tradingItems        = {}

						sendMessage("Trade with: " .. username .. " accepted, Method: Withdraw")


						local function countPets(tbl, id, type, shiny)
							local c = 0
							for i,v in next, tbl do
								if (v.id == id) and (v.type == type) and (v.shiny == shiny) then
									c = c + 1
								end
							end

							return c
						end

					for i, v in pairs(allWithdrawItems) do
						local newname = v
						
						local data = {
							["game_name"] = newname,
							["id"] = newname,
							["type"] = "Normal",
							["shiny"] = false
						}

						if string.find(newname, "Shiny") then
							newname = string.gsub(newname, "Shiny ", "")
							data["shiny"] = true
						end

						if string.find(newname, "Golden") then
							newname = string.gsub(newname, "Golden ", "")
							data["type"] = "Golden"
						elseif string.find(newname, "Rainbow") then
							newname = string.gsub(newname, "Rainbow ", "")
							data["type"] = "Rainbow"
						end
						
						data["game_name"] = newname
						data["id"] = newname
						
						table.insert(newWithdrawData, data)
					end
					
					for index, pet in next, newWithdrawData do
						usedPetsNames[(tostring(pet.shiny) .. pet.type .. pet.id)] = countPets(newWithdrawData, pet.id, pet.type, pet.shiny)
					end
					
					for index, pet in next, newWithdrawData do
						print("[Pet Matching] Looking for:", pet.id, "Type:", pet.type, "Shiny:", pet.shiny)
						local foundMatch = false
						
						for index, petData in next, petInventory do
							if not table.find(usedPets, petData.uuid) and (pet.id == petData.id) and (pet.shiny == petData.shiny) and (pet.type == petData.type) and not (usedPetsNames[(tostring(pet.shiny) .. pet.type .. pet.id)] == usedPetsNamesTemp[(tostring(pet.shiny) .. pet.type .. pet.id)]) then
								if not usedPetsNamesTemp[(tostring(pet.shiny) .. pet.type .. pet.id)] then
									usedPetsNamesTemp[(tostring(pet.shiny) .. pet.type .. pet.id)] = 1
								elseif usedPetsNamesTemp[(tostring(pet.shiny) .. pet.type .. pet.id)] ~= usedPetsNames[(tostring(pet.shiny) .. pet.type .. pet.id)] then
									usedPetsNamesTemp[(tostring(pet.shiny) .. pet.type .. pet.id)] = usedPetsNamesTemp[(tostring(pet.shiny) .. pet.type .. pet.id)] + 1
								end
								
								table.insert(usedPets, petData.uuid)

								local petstring = (petData.shiny and "Shiny " or "")..((petData.type == "Golden" and "Golden ") or (petData.type == "Rainbow" and "Rainbow ") or "")..petData.id
								table.insert(tradingItems, petstring)
								print("[Pet Matching] ✓ Found match:", petstring)

								addPet(petData.uuid)
								foundMatch = true
								break
							end
						end
						
						if not foundMatch then
							print("[Pet Matching] ✗ No match found for:", pet.id, pet.type, pet.shiny)
						end
					end
						
						-- If we're missing pets, try one more time with a fresh inventory
						if #tradingItems ~= #newWithdrawData and #tradingItems < #newWithdrawData then
							print("[Withdraw] Missing pets detected, attempting final inventory refresh...")
							task.wait(1)
							
							-- Get fresh inventory
							local freshInventory = getHugesTitanics(hugesTitanicsIds)
							print("[Withdraw] Fresh inventory check found", #freshInventory, "pets")
							
							-- Try to find missing pets
							for index, pet in next, newWithdrawData do
								local alreadyAdded = false
								for _, addedPet in next, tradingItems do
									local checkString = (pet.shiny and "Shiny " or "")..((pet.type == "Golden" and "Golden ") or (pet.type == "Rainbow" and "Rainbow ") or "")..pet.id
									if addedPet == checkString then
										alreadyAdded = true
										break
									end
								end
								
								if not alreadyAdded then
									print("[Retry] Looking for missing pet:", pet.id, pet.type, pet.shiny)
									for _, petData in next, freshInventory do
										if not table.find(usedPets, petData.uuid) and (pet.id == petData.id) and (pet.shiny == petData.shiny) and (pet.type == petData.type) then
											table.insert(usedPets, petData.uuid)
											local petstring = (petData.shiny and "Shiny " or "")..((petData.type == "Golden" and "Golden ") or (petData.type == "Rainbow" and "Rainbow ") or "")..petData.id
											table.insert(tradingItems, petstring)
											print("[Retry] ✓ Found missing pet:", petstring)
											addPet(petData.uuid)
											break
										end
									end
								end
							end
						end
						
						local usedWithdrawalRows = {}
						local function recordDeliveredNames(names)
							for _, deliveredName in ipairs(names) do
								for rowIndex, row in ipairs(withdrawalRows) do
									if not usedWithdrawalRows[rowIndex] and row.name == deliveredName then
										usedWithdrawalRows[rowIndex] = true
										table.insert(withdrawalContext.withdrawalIds, row.id)
										break
									end
								end
							end
						end

						recordDeliveredNames(tradingItems)

						-- Gem packages represent diamond currency, not pet inventory entries.
						task.wait(0.3)
						gems = {}
						if type(withdrawGems) == "table" and #withdrawGems >= 1 then
							local gemAmount = 0
							local validGemPackages = true
							for _, gemItem in ipairs(withdrawGems) do
								local amount = gemNameToAmount(gemItem)
								if not amount then
									validGemPackages = false
									warn("[Withdraw] Invalid gem package:", gemItem)
									break
								end
								gemAmount = gemAmount + amount
							end

							local availableGems = client_currencies_gems() or 0
							if validGemPackages and gemAmount > 0 and gemAmount <= availableGems and addGems(gemAmount) then
								gems = withdrawGems
								recordDeliveredNames(withdrawGems)
								print("[Withdraw] Added", gemAmount, "diamonds to the trade")
							else
								warn("[Withdraw] Unable to add requested diamonds. Required:", gemAmount, "Available:", availableGems)
							end
						end
						
						if #withdrawalContext.withdrawalIds == 0 then
							sendMessage("This bot is out of stock for your withdrawal. Please try another bot.")
							pcall(declineTrade)
							releaseWithdrawalClaim(withdrawalContext.claimToken)
							goNext = true
						elseif #withdrawalContext.withdrawalIds < #withdrawalRows then
							local missingPets = {}
							for _, withdrawPet in ipairs(withdrawData) do
								local found = false
								for _, tradingPet in ipairs(tradingItems) do
									if withdrawPet == tradingPet then
										found = true
										break
									end
								end
								if not found then
									table.insert(missingPets, withdrawPet)
								end
							end
							
							if #missingPets > 0 then
								print("[Withdraw] Missing pets:", table.concat(missingPets, ", "))
								sendMessage("Partial stock available. Remaining items can be collected from another bot.")
							end
							connectStatus(localId, "withdraw", tradingItems, withdrawalContext)
							goNext = false
						else
							sendMessage("Please accept to receive your items!")
							connectStatus(localId, "withdraw", tradingItems, withdrawalContext)
							goNext = false
						end
					else
						tradingItems  = {}
						gems          = 0

						sendMessage("Trade with: " .. username .. " accepted, Method: Deposit")


						connectStatus(localId, "deposit", {}, 0)
						goNext = false
					end
				end
			end
		end)
	end
end)

print("[PS99 Trade Bot] script loaded in " .. tostring(tick() - startTick) .. "s")
