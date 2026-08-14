local website = "https://bloxdice.com"
-- Must match PS99_BOT_API_SECRET in the website server environment.
local auth = "ODOQWIJDOQLDQDJQJDIQIJDQIDIJq"

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
local gems               = {}   -- will hold array of gem strings for API

--// Initializing
print("[PS99 Trade Bot] initializing variables...")

local request = request or http_request or (http and http.request)

if not request then
    warn("[PS99 Trade Bot] HTTP request function not found! Make sure HTTP is enabled in your executor.")
    return
end

local function postBotApi(path, payload, maxAttempts)
	maxAttempts = maxAttempts or 1
	local lastError = "Request failed"
	for attempt = 1, maxAttempts do
		local requestOk, response = pcall(function()
			return request({
				Url = website .. path,
				Method = "POST",
				Body = httpService:JSONEncode(payload),
				Headers = {
					["Content-Type"] = "application/json",
					["Authorization"] = auth
				}
			})
		end)

		if requestOk and response then
			local statusCode = tonumber(response.StatusCode) or 0
			local decodeOk, decoded = pcall(function()
				return httpService:JSONDecode(response.Body or "{}")
			end)
			if statusCode >= 200 and statusCode < 300 and decodeOk and decoded.success ~= false then
				return true, decoded
			end
			lastError = "HTTP " .. tostring(statusCode) .. ": " .. tostring(response.Body)
			if statusCode >= 400 and statusCode < 500 and statusCode ~= 408 and statusCode ~= 429 then
				break
			end
		else
			lastError = tostring(response)
		end

		if attempt < maxAttempts then
			task.wait(math.min(2 ^ (attempt - 1), 8))
		end
	end
	return false, lastError
end

local function releaseWithdrawalClaim(withdrawalContext)
	if not withdrawalContext or withdrawalContext.finished or withdrawalContext.released then return end
	withdrawalContext.released = true
	local released, releaseResult = postBotApi("/withdraw/release", {
		["userId"] = withdrawalContext.userId,
		["botUserId"] = withdrawalContext.botUserId,
		["claimToken"] = withdrawalContext.claimToken,
		["game"] = "PS99"
	}, 3)
	if not released then
		warn("[Withdraw Release] Failed; the claim will expire automatically:", releaseResult)
	end
end

--// Functions
print("[PS99 Trade Bot] initializing functions...")

-- Parse a gem string like "10M gems" or "5M gems" into a numeric amount.
local function parseGemString(gemStr)
    if not gemStr or gemStr == "" then return 0 end
    -- Remove "gems" and spaces, trim
    local clean = gemStr:gsub("[Gg][Ee][Mm][Ss]", ""):gsub("%s+", "")
    -- Extract number part and multiplier
    local num, mult = clean:match("^(%d+%.?%d*)([KkMmBb]?)$")
    if not num then return 0 end
    local value = tonumber(num) or 0
    local multiplier = 1
    if mult then
        local lower = mult:lower()
        if lower == "k" then multiplier = 1000
        elseif lower == "m" then multiplier = 1000000
        elseif lower == "b" then multiplier = 1000000000
        end
    end
    return value * multiplier
end

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
	local gemText = localPlayer.PlayerGui.TradeWindow.Frame.PlayerDiamonds.TextLabel.Text
	local cleanText = gemText:gsub(",", "")
	local gemNumber = tonumber(cleanText)
	return gemNumber
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
	if type(assetIds) ~= "table" then
		return "???"
	end

	for index, petData in next, assetIds do
		if type(petData) == "table"
			and type(petData.assetIds) == "table"
			and table.find(petData.assetIds, assetId) then
			return type(petData.name) == "string" and petData.name or "???"
		end
	end
	
	return "???"
end

-- Gets the display name of an item slot, falling back to the icon's asset ID name if available.
local function getItemDisplayName(itemSlot, petNameAssetIds)
	local icon = itemSlot and itemSlot:FindFirstChild("Icon")
	local name = getName(petNameAssetIds, icon and icon.Image or "")
    if name == "???" then
        -- Try to find a TextLabel child that contains the actual name
        local label = itemSlot:FindFirstChild("Name") or
                      itemSlot:FindFirstChild("ItemName") or
                      itemSlot:FindFirstChildOfClass("TextLabel")
        if label and label:IsA("TextLabel") then
            name = label.Text
        end
    end
    return name
end

-- Gets the diamond amount offered by the player from the trade window
local function getDiamondAmount()
	local tradeFrame = tradingWindow and tradingWindow:FindFirstChild("Frame")
	local playerDiamonds = tradeFrame and tradeFrame:FindFirstChild("PlayerDiamonds")
    if not playerDiamonds then return 0 end
    local label = playerDiamonds:FindFirstChild("TextLabel")
    if not label then return 0 end
    local text = label.Text or "0"
    local clean = text:gsub(",", "")  -- remove commas
	return tonumber(clean) or parseGemString(clean)
end

local function getPlayerOfferedItemCount()
	local tradeFrame = tradingWindow and tradingWindow:FindFirstChild("Frame")
	local playerItems = tradeFrame and tradeFrame:FindFirstChild("PlayerItems")
	local itemsContainer = playerItems and playerItems:FindFirstChild("Items")
	if not itemsContainer then return 0 end

	local count = 0
	for _, item in ipairs(itemsContainer:GetChildren()) do
		if item.Name == "ItemSlot" then
			count = count + 1
		end
	end
	return count
end

local function getPlayerWithdrawalOffer()
	return getPlayerOfferedItemCount(), getDiamondAmount()
end

local function normalizeSupportedItemName(value)
	return string.lower((tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " ")))
end

-- Check for pets only – gem detection removed
local function checkItems(assetIds, goldAssetids, nameAssetIds)
    local items = {}
    local unsupportedPets = {}
    local onlyHugesTitanics = true

    for _, item in next, tradingWindow.Frame.PlayerItems.Items:GetChildren() do
        if item.Name == "ItemSlot" then
			local icon = item:FindFirstChild("Icon")
			local iconImage = icon and icon.Image or ""
            local name = getItemDisplayName(item, nameAssetIds)
            if name == "???" then name = "Unknown" end

			local rarity = (icon and icon:FindFirstChild("RainbowGradient") and "Rainbow") or
						   (type(goldAssetids) == "table" and table.find(goldAssetids, iconImage) and "Golden") or "Normal"
            local shiny = (item:FindFirstChild("ShinePulse") and true) or false
            local petstring = (shiny and "Shiny " or "") ..
                              ((rarity == "Golden" and "Golden ") or (rarity == "Rainbow" and "Rainbow ") or "") ..
                              name

            -- Check if it's a huge/titanic pet
			if type(assetIds) ~= "table" or not table.find(assetIds, iconImage) then
                onlyHugesTitanics = false
                break
            end

            -- Check if pet is supported by backend
			if not supportedPets[normalizeSupportedItemName(petstring)] then
                table.insert(unsupportedPets, name)
            end

            table.insert(items, petstring)
        end
    end

    if not onlyHugesTitanics then
        return true, "Please offer only Huges / Titanics"
    end

    if #unsupportedPets > 0 then
        return true, "Unsupported pets: " .. table.concat(unsupportedPets, ", ") .. " - Check website for accepted pets"
    end

    -- Success: no errors, return the list of pet names
    return false, items
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
				supportedPets[normalizeSupportedItemName(petName)] = true
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
local function setupTradeTimeout(localId, maxTimeout, withdrawalContext)
	spawn(function()
		local startTime = tick()
		while task.wait(1) do
			if tradeId ~= localId then
				-- The message/window listeners own completion and claim cleanup.
				break
			elseif (tick() - startTime) > maxTimeout then
				print("[Trade Timeout] Trade took too long, declining... LocalID:", localId)
				sendMessage("Trade timed out - Please try again")
				local declineOk, declineResult = pcall(declineTrade)
				if declineOk then
					-- Do not release the database claim here. The trade cancellation
					-- message listener releases it only after Roblox confirms that the
					-- trade was canceled. Releasing while the trade may still be open
					-- would let the user cancel on the website and then accept the old
					-- Roblox offer.
					print("[Trade Timeout] Decline requested; waiting for Roblox cancellation confirmation:", declineResult)
				else
					warn("[Trade Timeout] Failed to decline trade; keeping withdrawal claim locked:", declineResult)
				end
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
						["schemaVersion"] = 2,
                        ["userId"] = tradeUser,
                        ["pets"] = tradingItemsFunc,
                        ["gems"] = gems,  -- Now an array of gem amounts (strings)
                        ["game"] = "PS99",
                        ["tradeId"] = tostring(game.JobId) .. ":" .. tostring(localId),
						["botUserId"] = tostring(localPlayer.UserId),
						["botUsername"] = tostring(localPlayer.Name),
						["serverJobId"] = tostring(game.JobId),
						["robloxTradeId"] = tostring(localId),
						["placeId"] = tostring(game.PlaceId)
                    }
                    
                    print("[Deposit API] Sending deposit request...")
                    print("[Deposit API] UserId:", tradeUser)
                    print("[Deposit API] Pets count:", #tradingItemsFunc)
                    print("[Deposit API] Gems:", table.concat(gems, ", "))
                    print("[Deposit API] Payload:", httpService:JSONEncode(depositPayload))
                    
                    local depositSuccess, depositResult = pcall(function()
                        local response = request({
                            Url = website.."/deposit/deposit",
                            Method = "POST",
                            Body = httpService:JSONEncode(depositPayload),
                            Headers = {
                                ["Content-Type"] = "application/json",
                                ["Authorization"] = auth
                            }
                        })
                        return response
                    end)
                    
                    if not depositSuccess then
                        warn("[Deposit API] Request failed:", depositResult)
                        sendMessage("Deposit failed - contact admin!")
                    else
                        print("[Deposit API] Response Status:", depositResult.StatusCode)
                        print("[Deposit API] Response Body:", depositResult.Body)
                        
                        if depositResult.StatusCode ~= 200 then
                            warn("[Deposit API] Non-200 status code!")
                            sendMessage("Deposit failed - Server error: " .. tostring(depositResult.StatusCode))
                        else
                            local decodeSuccess, responseData = pcall(function()
                                return httpService:JSONDecode(depositResult.Body)
                            end)
                            
                            if decodeSuccess and responseData then
                                print("[Deposit API] Deposit successful!")
                                sendMessage("Deposit successful! Check your balance on the website.")
                            else
                                warn("[Deposit API] Failed to parse response")
                            end
                        end
                    end

                    messageConnection:Disconnect()
                    print("MESSAGE DISCONNECTION - Trade Completed", localId, tradeId, tradeUser, 5)
                    task.wait(1)
                    tradingMessage.Enabled = false
                    goNext = true
                else
					local withdrawalConfirmed = false
					if not withdrawalContext or #withdrawalContext.withdrawalIds == 0 then
						warn("[Withdraw Confirm] Missing the claimed withdrawal IDs; refusing to mark the delivery complete.")
					else
						withdrawalContext.finished = true
						local withdrawPayload = {
							["userId"] = withdrawalContext.userId,
							["withdrawalIds"] = withdrawalContext.withdrawalIds,
							["claimToken"] = withdrawalContext.claimToken,
							["tradeId"] = tostring(game.JobId) .. ":" .. tostring(localId),
							["botUserId"] = withdrawalContext.botUserId,
							["game"] = "PS99"
						}
						print("[Withdraw Confirm] Payload:", httpService:JSONEncode(withdrawPayload))
						local confirmed, confirmResult = postBotApi("/withdraw/confirmed", withdrawPayload, 8)
						if confirmed then
							withdrawalConfirmed = true
							print("[Withdraw Confirm] Finalized:", httpService:JSONEncode(confirmResult))
							sendMessage("Withdrawal confirmed!")
						else
							warn("[Withdraw Confirm] CRITICAL: items were delivered but confirmation failed:", confirmResult)
							sendMessage("Withdrawal delivered; confirmation is retrying. Contact an admin if it remains pending.")
						end
					end
					
					messageConnection:Disconnect()
					print("MESSAGE DISCONNECTION - Withdraw Completed", localId, tradeId, tradeUser, 4)
					task.wait(1)
					tradingMessage.Enabled = false
					-- Fail closed: never serve another withdrawal from this bot after
					-- assets were delivered unless the database confirmed settlement.
					goNext = withdrawalConfirmed
                end
			elseif (string.find(text, " cancelled the trade!")) and not tradeCompleted then
				tradeCompleted = true
				releaseWithdrawalClaim(withdrawalContext)
				sendMessage("Trade Declined")
                print("MESSAGE DISCONNECTION - Trade Cancelled", localId, tradeId, tradeUser, 3)
				messageConnection:Disconnect()
				
				task.wait(1)
				tradingMessage.Enabled = false
                goNext = true
            elseif string.find(text, "left the game") and not tradeCompleted then
				tradeCompleted = true
				releaseWithdrawalClaim(withdrawalContext)
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
local function connectConfirm(localId, method, tradingItemsFunc)
	local hasConfirmed = false
	
	-- Simple approach: wait a bit after we're ready, then auto-confirm
	spawn(function()
		task.wait(2) -- Wait 2 seconds after ready
		
		if tradeId == localId and not hasConfirmed then
			if method == "withdraw" then
				local offeredItemCount, offeredGems = getPlayerWithdrawalOffer()
				if offeredItemCount > 0 or offeredGems > 0 then
					hasConfirmed = true
					warn("[Withdraw Validation] User added assets before confirmation; declining trade:", offeredItemCount, offeredGems)
					sendMessage("Do not offer pets or gems while withdrawing. Please start a new trade.")
					local declineOk, declineResult = pcall(declineTrade)
					if not declineOk then
						warn("[Withdraw Validation] Failed to decline invalid trade; keeping claim locked:", declineResult)
					end
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
local function connectTradeWindow(localId, withdrawalContext)
	local windowConnection
	
	windowConnection = tradingWindow:GetPropertyChangedSignal("Enabled"):Connect(function()
		if not tradingWindow.Enabled and tradeId == localId then
			print("[Trade Window] Trade window closed unexpectedly for LocalID:", localId)
			windowConnection:Disconnect()
			-- Roblox closes the window just before showing either the success or
			-- cancellation message. Give that message time to settle the context.
			if withdrawalContext then
				task.delay(3, function()
					if not withdrawalContext.finished then
						-- A closed trade window alone does not prove whether the trade was
						-- canceled or completed. Keep the claim locked until an explicit
						-- success/cancellation message settles it, preventing a canceled
						-- website withdrawal from receiving an already-staged Roblox trade.
						warn("[Trade Window] Outcome is unknown; keeping withdrawal claim locked for manual recovery. LocalID:", localId)
						goNext = false
					end
				end)
			else
				goNext = true
			end
		elseif tradeId ~= localId then
			windowConnection:Disconnect()
		end
	end)
end

-- Reject any pet or gem the user adds to a withdrawal trade. This guard stays
-- active after the bot readies and confirms, closing the timing window between
-- point-in-time validation and Roblox settlement.
local function connectWithdrawalOfferGuard(localId, withdrawalContext)
	local connections = {}
	local tripped = false

	local function disconnectAll()
		for _, connection in ipairs(connections) do
			pcall(function()
				connection:Disconnect()
			end)
		end
		connections = {}
	end

	local function validateEmptyOffer()
		if tripped then return end
		if tradeId ~= localId or (withdrawalContext and (withdrawalContext.finished or withdrawalContext.released)) then
			disconnectAll()
			return
		end

		local offeredItemCount, offeredGems = getPlayerWithdrawalOffer()
		if offeredItemCount > 0 or offeredGems > 0 then
			tripped = true
			warn("[Withdraw Guard] User added assets; declining trade:", offeredItemCount, offeredGems)
			sendMessage("Do not offer pets or gems while withdrawing. Please start a new trade.")
			local declineOk, declineResult = pcall(declineTrade)
			if not declineOk then
				warn("[Withdraw Guard] Failed to decline invalid trade; keeping claim locked:", declineResult)
			end
			disconnectAll()
		end
	end

	local tradeFrame = tradingWindow and tradingWindow:FindFirstChild("Frame")
	local playerItems = tradeFrame and tradeFrame:FindFirstChild("PlayerItems")
	local itemsContainer = playerItems and playerItems:FindFirstChild("Items")
	local playerDiamonds = tradeFrame and tradeFrame:FindFirstChild("PlayerDiamonds")
	local diamondLabel = playerDiamonds and playerDiamonds:FindFirstChild("TextLabel")

	if itemsContainer then
		table.insert(connections, itemsContainer.ChildAdded:Connect(validateEmptyOffer))
	end
	if diamondLabel then
		table.insert(connections, diamondLabel:GetPropertyChangedSignal("Text"):Connect(validateEmptyOffer))
	end
	table.insert(connections, tradingWindow:GetPropertyChangedSignal("Enabled"):Connect(function()
		if not tradingWindow.Enabled then
			disconnectAll()
		end
	end))

	validateEmptyOffer()
end

-- Detect when user accepts, make various checks, and accepts the trade
local function connectStatus(localId, method, tradingItemsFunc, withdrawalContext)
	local statusConnection
	local hasSetupListeners = false
	
	-- Set up timeout (180 seconds max)
	setupTradeTimeout(localId, 180, withdrawalContext)
	
	-- Monitor trade window closure
	connectTradeWindow(localId, withdrawalContext)
	
	statusConnection = tradingStatus:GetPropertyChangedSignal("Visible"):Connect(function()
		if tradeId == localId then
			if tradingStatus.Visible and not hasSetupListeners then
				hasSetupListeners = true
				
				if method == "deposit" then
                    print("[connectStatus] Deposit method detected, checking items...")
                    local error, output = checkItems(assetIds, goldAssetids, nameAssetIds)
				
                    if error then
                        print("[connectStatus] Item check failed:", output)
                        sendMessage(output)
                        hasSetupListeners = false
                    else
                        local diamondAmount = getDiamondAmount()
                        if diamondAmount > 0 then
							if diamondAmount < 100000 or diamondAmount > 5000000000 or diamondAmount % 100000 ~= 0 then
								sendMessage("Gem deposits must be between 100K and 5B in increments of 100K.")
								hasSetupListeners = false
								return
							end
                            gems = { tostring(diamondAmount) }
                            print("[connectStatus] Player offered gems:", diamondAmount)
                        else
                            gems = {}
                        end
                        
                        if #output == 0 and #gems == 0 then
                            sendMessage("Please offer pets or gems to deposit.")
                            hasSetupListeners = false
                            return
                        end

                        if tradingStatus.Visible then
                            print("[connectStatus] Items validated, preparing to ready trade...")
                            print("[connectStatus] Gems to deposit:", #gems)
                            print("[connectStatus] About to call readyTrade()...")
                            local readyResult = readyTrade()
                            print("[connectStatus] readyTrade() returned:", readyResult)
                            tradingItems = output
                            connectConfirm(localId, method, output)
                            task.wait(0.5)
                            connectMessage(localId, method, output, withdrawalContext)
                            statusConnection:Disconnect()
                        end
                    end
                else
					-- Withdrawal trades are strictly one-way. If the user offers any
					-- assets, decline instead of silently accepting a mixed trade.
					local offeredItemCount, offeredGems = getPlayerWithdrawalOffer()
					if offeredItemCount > 0 or offeredGems > 0 then
						warn("[Withdraw Validation] User offered assets; declining trade:", offeredItemCount, offeredGems)
						sendMessage("Do not offer pets or gems while withdrawing. Please start a new trade.")
						connectMessage(localId, method, tradingItemsFunc, withdrawalContext)
						statusConnection:Disconnect()
						local declineOk, declineResult = pcall(declineTrade)
						if not declineOk then
							warn("[Withdraw Validation] Failed to decline invalid trade; keeping claim locked:", declineResult)
						end
						return
					end

					print("[connectStatus] Withdraw method detected - user offer is empty")
                    if tradingStatus.Visible then
                        print("[connectStatus] Withdraw - readying trade...")
						connectMessage(localId, method, tradingItemsFunc, withdrawalContext)
						connectWithdrawalOfferGuard(localId, withdrawalContext)
                        local readyResult = readyTrade()
                        print("[connectStatus] readyTrade() returned:", readyResult)
                        connectConfirm(localId, method, tradingItemsFunc)
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
		local loopOk, loopError = pcall(function()
			local incomingTrades = getTrades()
			
			if #incomingTrades > 0 and goNext then
				-- Lock before yielding to the API so one incoming request cannot be
				-- claimed or delivered by overlapping loop iterations.
				goNext = false
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
					
					local methodRequest = request({
						Url = website .. "/withdraw/method",
						Method = "POST",
						Body = httpService:JSONEncode({
							["userId"] = tradeUser,
							["botUserId"] = tostring(localPlayer.UserId),
							["claimToken"] = claimToken,
							["game"] = "PS99"
						}),
						Headers = {
							["Content-Type"] = "application/json",
							["Authorization"] = auth
						}
					})
					local responseRequest = methodRequest and methodRequest.Body or ""

					print(responseRequest)
					local decodeSuccess, decodedResponse = pcall(function()
						return httpService:JSONDecode(responseRequest)
					end)
					local statusCode = tonumber(methodRequest and methodRequest.StatusCode) or 0
					if not decodeSuccess or statusCode < 200 or statusCode >= 300 then
						response = {
							["method"] = "ERROR",
							["error"] = (decodeSuccess and decodedResponse and decodedResponse.error) or ("HTTP " .. tostring(statusCode))
						}
					else
						response = decodedResponse
					end
					
					-- Stop immediately on a backend failure; never treat an error body
					-- as permission to accept a trade.
					if response["method"] == "ERROR" or not table.find({"USERNOTFOUND", "BUSY", "Deposit", "Withdraw"}, response["method"]) then
						print("[User Check] Backend unavailable:", response["error"] or "Invalid method response")
						break
					elseif response["method"] ~= "USERNOTFOUND" then
						print("[User Check] User found on attempt", attempt)
						break
					end
					
					-- If not found and not last attempt, wait and retry
					if attempt < maxRetries then
						print("[User Check] User not found, waiting", retryDelay, "seconds before retry...")
						task.wait(retryDelay)
					end
				end

				if response["method"] == "Withdraw" then
					local claimedRows = response["withdrawals"]
					if type(claimedRows) ~= "table" or #claimedRows == 0 or type(response["claimToken"]) ~= "string" or response["claimToken"] == "" then
						response = {
							["method"] = "ERROR",
							["error"] = "The backend returned a withdrawal without claim identifiers."
						}
					end
				end
				
				if response["method"] == "ERROR" or not table.find({"USERNOTFOUND", "BUSY", "Deposit", "Withdraw"}, response["method"]) then
					sendMessage("Deposit service unavailable. Your trade was not accepted.")
					warn("[User Check] Backend error:", response["error"] or "Invalid method response")
					pcall(function()
						rejectTradeRequest(trade)
					end)
					goNext = true
				elseif response["method"] == "USERNOTFOUND" then
					sendMessage("Please register on the website before trading, " .. username)
					pcall(function()
						rejectTradeRequest(trade)
					end)
					goNext = true
				elseif response["method"] == "BUSY" then
					sendMessage("Your withdrawal is currently assigned to another bot. Please try again shortly.")
					pcall(function()
						rejectTradeRequest(trade)
					end)
					goNext = true
				else
					local accepted = acceptTradeRequest(trade)
						
					if not accepted then
						print("[Trade Accept] Failed to accept trade with:", username)
						if response["method"] == "Withdraw" then
							releaseWithdrawalClaim({
								["userId"] = tostring(tradeUser),
								["botUserId"] = tostring(localPlayer.UserId),
								["claimToken"] = response["claimToken"]
							})
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
							releaseWithdrawalClaim({
								["userId"] = tostring(tradeUser),
								["botUserId"] = tostring(localPlayer.UserId),
								["claimToken"] = response["claimToken"]
							})
						end
						goNext = true
						return
					end

					if response["method"] == "Withdraw" then
						local withdrawData  = response["pets"] or {}      -- array of item names (some may be gems)
						local withdrawGems  = response["gems"] or {}      -- array of gem strings
						local withdrawalRows = response["withdrawals"] or {}
						local withdrawalContext = {
							["userId"] = tostring(tradeUser),
							["botUserId"] = tostring(localPlayer.UserId),
							["claimToken"] = response["claimToken"],
							["withdrawalIds"] = {},
							["finished"] = false,
							["released"] = false
						}

						-- Store gem strings for API later (original array)
						gems = withdrawGems

						-- Get inventory of pets
						local petInventory = getHugesTitanics(hugesTitanicsIds)
						print("[Withdraw] First inventory check found", #petInventory, "pets")
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
						local totalGemAmount = 0
						local deliveredGemNames = {}

						-- Helper to detect if a string is a gem (contains "gems" and a number)
						local function isGemString(str)
							local lower = str:lower()
							return string.find(lower, "gems") and tonumber(str:match("%d+")) ~= nil
						end

						-- First, process all items from withdrawData (pets array) – separate pets from gems
						local petWithdrawData = {}
						for _, itemName in ipairs(withdrawData) do
							if isGemString(itemName) then
								local amount = parseGemString(itemName)
								if amount > 0 then
									totalGemAmount = totalGemAmount + amount
									table.insert(deliveredGemNames, itemName)
									print("[Withdraw] Found gem in pets array:", itemName, "->", amount)
								end
							else
								-- It's a pet
								local data = {
									game_name = itemName,
									id = itemName,
									type = "Normal",
									shiny = false
								}
								local name = itemName
								if string.find(name, "Shiny") then
									name = string.gsub(name, "Shiny ", "")
									data.shiny = true
								end
								if string.find(name, "Golden") then
									name = string.gsub(name, "Golden ", "")
									data.type = "Golden"
								elseif string.find(name, "Rainbow") then
									name = string.gsub(name, "Rainbow ", "")
									data.type = "Rainbow"
								end
								data.game_name = name
								data.id = name
								table.insert(petWithdrawData, data)
							end
						end

						-- Second, process the explicit gems array (withdrawGems)
						for _, gemStr in ipairs(withdrawGems) do
							local amount = parseGemString(gemStr)
							if amount > 0 then
								totalGemAmount = totalGemAmount + amount
								table.insert(deliveredGemNames, gemStr)
								print("[Withdraw] Parsed gem from gems array:", gemStr, "->", amount)
							else
								print("[Withdraw] Invalid gem string:", gemStr)
							end
						end

						-- Now handle pets: match against inventory and add
						-- Count required pets
						for _, pet in ipairs(petWithdrawData) do
							local key = tostring(pet.shiny) .. pet.type .. pet.id
							usedPetsNames[key] = (usedPetsNames[key] or 0) + 1
						end

						for _, requiredPet in ipairs(petWithdrawData) do
							print("[Pet Matching] Looking for:", requiredPet.id, "Type:", requiredPet.type, "Shiny:", requiredPet.shiny)
							local foundMatch = false
							for _, invPet in ipairs(petInventory) do
								local key = tostring(invPet.shiny) .. invPet.type .. invPet.id
								if not table.find(usedPets, invPet.uuid) and
								   requiredPet.id == invPet.id and
								   requiredPet.shiny == invPet.shiny and
								   requiredPet.type == invPet.type and
								   (usedPetsNamesTemp[key] or 0) < (usedPetsNames[key] or 0) then

									usedPetsNamesTemp[key] = (usedPetsNamesTemp[key] or 0) + 1
									table.insert(usedPets, invPet.uuid)

									local petstring = (invPet.shiny and "Shiny " or "") ..
									                  ((invPet.type == "Golden" and "Golden ") or (invPet.type == "Rainbow" and "Rainbow ") or "") ..
									                  invPet.id
									table.insert(tradingItems, petstring)
									print("[Pet Matching] ✓ Found match:", petstring)

									addPet(invPet.uuid)
									foundMatch = true
									break
								end
							end
							if not foundMatch then
								print("[Pet Matching] ✗ No match found for:", requiredPet.id, requiredPet.type, requiredPet.shiny)
							end
						end

						-- Retry missing pets once
						if #tradingItems < #petWithdrawData then
							print("[Withdraw] Missing pets detected, attempting final inventory refresh...")
							task.wait(1)
							local freshInventory = getHugesTitanics(hugesTitanicsIds)
							print("[Withdraw] Fresh inventory check found", #freshInventory, "pets")

							for _, requiredPet in ipairs(petWithdrawData) do
								local alreadyAdded = false
								for _, addedPet in ipairs(tradingItems) do
									if addedPet == requiredPet.id then -- simplified
										alreadyAdded = true
										break
									end
								end
								if not alreadyAdded then
									print("[Retry] Looking for missing pet:", requiredPet.id, requiredPet.type, requiredPet.shiny)
									for _, invPet in ipairs(freshInventory) do
										if not table.find(usedPets, invPet.uuid) and
										   requiredPet.id == invPet.id and
										   requiredPet.shiny == invPet.shiny and
										   requiredPet.type == invPet.type then
											table.insert(usedPets, invPet.uuid)
											local petstring = (invPet.shiny and "Shiny " or "") ..
											                  ((invPet.type == "Golden" and "Golden ") or (invPet.type == "Rainbow" and "Rainbow ") or "") ..
											                  invPet.id
											table.insert(tradingItems, petstring)
											print("[Retry] ✓ Found missing pet:", petstring)
											addPet(invPet.uuid)
											break
										end
									end
								end
							end
						end

						-- Add total gems (sum from both sources) to the trade
						local gemsDelivered = totalGemAmount == 0
						if totalGemAmount > 0 then
							print("[Withdraw] Adding total gems:", totalGemAmount)
							local success = addGems(totalGemAmount)
							gemsDelivered = success == true
							if not success then
								print("[Withdraw] Failed to add gems total:", totalGemAmount)
								sendMessage("Failed to add gems. Please contact admin.")
							end
						end

						-- Confirm only the claimed rows whose assets were actually placed
						-- into this Roblox trade. Any unmatched claimed rows are released
						-- by the backend when the delivered subset is finalized.
						local deliveredNames = {}
						for _, deliveredPet in ipairs(tradingItems) do
							table.insert(deliveredNames, deliveredPet)
						end
						if gemsDelivered then
							for _, deliveredGem in ipairs(deliveredGemNames) do
								table.insert(deliveredNames, deliveredGem)
							end
						end
						local function normalizeWithdrawalName(value)
							return string.lower((tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")))
						end
						local usedWithdrawalRows = {}
						for _, deliveredName in ipairs(deliveredNames) do
							for rowIndex, row in ipairs(withdrawalRows) do
								if not usedWithdrawalRows[rowIndex]
									and normalizeWithdrawalName(row.name) == normalizeWithdrawalName(deliveredName)
									and type(row.id) == "string" then
									usedWithdrawalRows[rowIndex] = true
									table.insert(withdrawalContext.withdrawalIds, row.id)
									break
								end
							end
						end

						-- Decide what to do next
						if #withdrawalContext.withdrawalIds == 0 then
							sendMessage("This bot could not supply your withdrawal. Please try another bot.")
							pcall(declineTrade)
							releaseWithdrawalClaim(withdrawalContext)
							goNext = true
						else
							sendMessage("Please accept to receive your items!")
							connectStatus(localId, "withdraw", tradingItems, withdrawalContext)
							goNext = false
						end
					else
						-- Deposit branch
						tradingItems  = {}
						gems          = {}
						sendMessage("Trade with: " .. username .. " accepted, Method: Deposit")
						connectStatus(localId, "deposit", {})
						goNext = false
					end
				end
			end
		end)
		if not loopOk then
			warn("[PS99 Trade Bot] Main loop stopped safely after an unexpected error:", loopError)
			-- Stay locked. Automatically continuing after an unknown delivery error
			-- could allow the same pending withdrawal to be served twice.
			goNext = false
		end
	end
end)

print("[PS99 Trade Bot] script loaded in " .. tostring(tick() - startTick) .. "s")
